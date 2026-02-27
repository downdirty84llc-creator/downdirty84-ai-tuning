import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import {
	DiffSetSummary,
	Job,
	RunStatus,
	analyzeJob,
	exportCsv,
	exportSummary,
	generateDiffset,
	getFindings,
	getJob,
	getLatestRun,
	listRuns,
	getRunStatus,
	getValidation,
	listDiffsets
} from "./jobs";
import { listJobUploads, uploadFile } from "./uploads";

type UploadRow = { id: string; filename: string; kind: string };

const TERMINAL_RUN_STATUSES = new Set(["SUCCEEDED", "FAILED", "CANCELED"]);

export default function JobDashboard() {
	const { jobId } = useParams();
	const [searchParams, setSearchParams] = useSearchParams();
	const runIdFromQuery = searchParams.get("runId");
	const [job, setJob] = useState<Job | null>(null);
	const [uploads, setUploads] = useState<UploadRow[]>([]);
	const [selectedUploadIds, setSelectedUploadIds] = useState<string[]>([]);
	const [uploadKind, setUploadKind] = useState("LOG");
	const [file, setFile] = useState<File | null>(null);
	const [isUploading, setIsUploading] = useState(false);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	const [isGeneratingDiffset, setIsGeneratingDiffset] = useState(false);
	const [isSwitchingRun, setIsSwitchingRun] = useState(false);
	const [summaryExportingId, setSummaryExportingId] = useState<string | null>(null);
	const [csvExportingId, setCsvExportingId] = useState<string | null>(null);

	const [runId, setRunId] = useState<string | null>(null);
	const [runStatus, setRunStatus] = useState<RunStatus | null>(null);
	const [runs, setRuns] = useState<RunStatus[]>([]);

	const [validation, setValidation] = useState<unknown>(null);
	const [findings, setFindings] = useState<unknown>(null);
	const [diffsets, setDiffsets] = useState<DiffSetSummary[]>([]);
	const [artifactsUpdatedAt, setArtifactsUpdatedAt] = useState<string | null>(null);
	const [isRefreshingArtifacts, setIsRefreshingArtifacts] = useState(false);
	const [summaryByDiffSetId, setSummaryByDiffSetId] = useState<Record<string, string>>({});
	const [statusMsg, setStatusMsg] = useState<string | null>(null);

	const isGmLsEligible = useMemo(() => !!(
		job &&
		job.platform === "GM" &&
		(job.engine_family || "").toUpperCase().includes("LS") &&
		["P01", "P59"].includes((job.ecu || "").toUpperCase())
	), [job]);

	const selectedLogUploadIds = useMemo(() => {
		const byId = new Map(uploads.map((upload) => [upload.id, upload]));
		return selectedUploadIds.filter((uploadId) => {
			const upload = byId.get(uploadId);
			return upload?.kind === "LOG";
		});
	}, [uploads, selectedUploadIds]);

	function pretty(value: unknown) {
		try {
			return JSON.stringify(value, null, 2);
		} catch {
			return String(value);
		}
	}

	function syncSelectedUploads(nextUploads: UploadRow[]) {
		const validIds = new Set(nextUploads.map((upload) => upload.id));
		setSelectedUploadIds((prev) => prev.filter((id) => validIds.has(id)));
	}

	function toggleUploadSelection(uploadId: string) {
		setSelectedUploadIds((prev) =>
			prev.includes(uploadId)
				? prev.filter((id) => id !== uploadId)
				: [...prev, uploadId]
		);
	}

	function toggleAllUploadSelection() {
		setSelectedUploadIds((prev) => {
			if (uploads.length > 0 && prev.length === uploads.length) return [];
			return uploads.map((upload) => upload.id);
		});
	}

	async function loadArtifacts(currentJobId: string, currentRunId?: string | null) {
		const [v, f, ds] = await Promise.all([
			getValidation(currentJobId, currentRunId).catch(() => null),
			getFindings(currentJobId, currentRunId).catch(() => null),
			listDiffsets(currentJobId, currentRunId).catch(() => [])
		]);
		setValidation(v);
		setFindings(f);
		setDiffsets(ds);
		setArtifactsUpdatedAt(new Date().toISOString());
	}

	async function refreshRuns(currentJobId: string) {
		const res = await listRuns(currentJobId).catch(() => ({ runs: [] as RunStatus[] }));
		setRuns(res.runs || []);
	}

	useEffect(() => {
		if (!jobId) return;
		(async () => {
			try {
				const [jobRes, uploadRes] = await Promise.all([
					getJob(jobId),
					listJobUploads(jobId)
				]);
				setJob(jobRes.job);
				const initialUploads = (uploadRes.uploads || []) as UploadRow[];
				setUploads(initialUploads);
				syncSelectedUploads(initialUploads);
				await refreshRuns(jobId);

				const initialRun = runIdFromQuery
					? await getRunStatus(runIdFromQuery).catch(() => null)
					: await getLatestRun(jobId).catch(() => null);

				if (initialRun) {
					setRunId(initialRun.runId);
					setRunStatus(initialRun);
					await loadArtifacts(jobId, initialRun.runId);
					if (!runIdFromQuery || runIdFromQuery !== initialRun.runId) {
						setSearchParams({ runId: initialRun.runId }, { replace: true });
					}
				} else {
					await loadArtifacts(jobId, null);
				}
			} catch {
				setStatusMsg("Unable to load job details.");
			}
		})();
	}, [jobId, runIdFromQuery, setSearchParams]);

	useEffect(() => {
		if (!runId) return;
		if (runIdFromQuery === runId) return;
		setSearchParams({ runId }, { replace: true });
	}, [runId, runIdFromQuery, setSearchParams]);

	useEffect(() => {
		if (!runId || !jobId) return;

		let cancelled = false;
		let pollingDone = false;
		let timer: number | null = null;
		const tick = async () => {
			if (pollingDone) return;
			try {
				const run = await getRunStatus(runId);
				if (cancelled) return;

				setRunStatus(run);
				if (TERMINAL_RUN_STATUSES.has(run.status)) {
					pollingDone = true;
					if (timer !== null) window.clearInterval(timer);
					await loadArtifacts(jobId, runId);
					if (run.status === "SUCCEEDED") {
						setStatusMsg(`Run ${runId} completed. Review findings and generate diffset if eligible.`);
					} else {
						setStatusMsg(`Run ${runId} finished with status: ${run.status}.`);
					}
				}
			} catch {
				if (!cancelled) setStatusMsg("Unable to refresh run status right now.");
			} finally {
				if (!cancelled) setIsSwitchingRun(false);
			}
		};

		tick();
		timer = window.setInterval(tick, 1200);
		return () => {
			cancelled = true;
			if (timer !== null) window.clearInterval(timer);
		};
	}, [runId, jobId]);

	async function onUpload() {
		if (!file || !jobId) return;
		try {
			setIsUploading(true);
			setStatusMsg("Uploading...");
			const r = await uploadFile({ file, jobId, kind: uploadKind });
			const listed = await listJobUploads(jobId);
			const nextUploads = (listed.uploads || []) as UploadRow[];
			setUploads(nextUploads);
			syncSelectedUploads(nextUploads);
			setSelectedUploadIds((prev) => (prev.includes(r.uploadId) ? prev : [r.uploadId, ...prev]));
			setFile(null);
			setStatusMsg(`Uploaded ${uploadKind} file and selected it. You can upload more, then click Analyze.`);
		} catch {
			setStatusMsg("Upload failed. Please try again.");
		} finally {
			setIsUploading(false);
		}
	}

	async function onAnalyze() {
		if (!jobId) return;
		if (selectedLogUploadIds.length === 0) {
			setStatusMsg("Select at least one LOG upload first.");
			return;
		}
		try {
			setSelectedUploadIds(selectedLogUploadIds);
			setIsAnalyzing(true);
			setStatusMsg("Starting analysis...");
			const r = await analyzeJob(jobId, selectedLogUploadIds);
			setRunId(r.runId);
			await refreshRuns(jobId);
			setStatusMsg(`Analysis queued. Run ID: ${r.runId}`);
		} catch {
			setStatusMsg("Could not start analysis. Please try again.");
		} finally {
			setIsAnalyzing(false);
		}
	}

	async function onGenerateDiffset() {
		if (!jobId || !runId) return;
		try {
			setIsGeneratingDiffset(true);
			setStatusMsg("Generating diffset...");
			await generateDiffset(jobId, runId);
			await loadArtifacts(jobId, runId);
			await refreshRuns(jobId);
			setStatusMsg("Diffset generated. You can export summary or CSV.");
		} catch {
			setStatusMsg("Could not generate diffset. Check eligibility and completed run status.");
		} finally {
			setIsGeneratingDiffset(false);
		}
	}

	async function onExportSummary(diffSetId: string) {
		try {
			setSummaryExportingId(diffSetId);
			const res = await exportSummary(diffSetId);
			setSummaryByDiffSetId(prev => ({ ...prev, [diffSetId]: res.text }));
			setStatusMsg("Summary exported.");
		} catch {
			setStatusMsg("Could not export summary.");
		} finally {
			setSummaryExportingId(null);
		}
	}

	async function onExportCsv(diffSetId: string) {
		try {
			setCsvExportingId(diffSetId);
			const csv = await exportCsv(diffSetId);
			const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const link = document.createElement("a");
			link.href = url;
			link.download = `DownDirty84_${diffSetId.slice(0, 8)}_ChangeList.csv`;
			document.body.appendChild(link);
			link.click();
			link.remove();
			URL.revokeObjectURL(url);
			setStatusMsg("CSV downloaded.");
		} catch {
			setStatusMsg("Could not export CSV.");
		} finally {
			setCsvExportingId(null);
		}
	}

	async function onCopyRunLink() {
		if (!runId) return;
		try {
			await navigator.clipboard.writeText(window.location.href);
			setStatusMsg("Run link copied.");
		} catch {
			setStatusMsg("Could not copy run link.");
		}
	}

	async function onRefreshArtifacts() {
		if (!jobId) return;
		try {
			setIsRefreshingArtifacts(true);
			setStatusMsg("Refreshing artifacts...");
			await loadArtifacts(jobId, runId);
			setStatusMsg("Artifacts refreshed.");
		} catch {
			setStatusMsg("Could not refresh artifacts.");
		} finally {
			setIsRefreshingArtifacts(false);
		}
	}

	return (
		<div className="container">
			<div className="nav">
				<div className="brand">Down Dirty 84</div>
				<div className="row">
					<Link to="/dashboard" style={{textDecoration:"none"}}>
						<button className="secondary">Back to Jobs</button>
					</Link>
					<Link to="/dashboard" style={{textDecoration:"none"}}>
						<button>Create Another Job</button>
					</Link>
				</div>
			</div>

			<div className="card" style={{marginBottom:14}}>
				<h2 style={{marginTop:0}}>Job Dashboard</h2>
				{job && <p className="small"><b>Job:</b> {job.vehicle || job.id} - {job.platform} {job.service_type} ({job.status})</p>}
				{statusMsg && <p className="small">{statusMsg}</p>}
			</div>

			<div className="card">
				<div className="row" style={{alignItems:"center"}}>
					<input type="file" onChange={(e)=>setFile(e.target.files?.[0] || null)} disabled={isUploading || isAnalyzing || isSwitchingRun} />
					<select value={uploadKind} onChange={(e)=>setUploadKind(e.target.value)} disabled={isUploading || isAnalyzing || isSwitchingRun}>
						<option value="LOG">LOG</option>
						<option value="TUNE">TUNE</option>
					</select>
					<button onClick={onUpload} disabled={!file || isUploading || isAnalyzing || isSwitchingRun}>{isUploading ? "Uploading..." : "Upload File"}</button>
					<button onClick={onAnalyze} disabled={selectedLogUploadIds.length===0 || isUploading || isAnalyzing || isSwitchingRun}>{isAnalyzing ? "Starting..." : "Analyze"}</button>
				</div>
				{selectedLogUploadIds.length === 0 && !isUploading && !isAnalyzing && !isSwitchingRun && (
					<p className="small" style={{marginTop:8}}>Select at least one uploaded LOG file to enable Analyze.</p>
				)}

				<p className="small">Uploaded files: {uploads.length}</p>
				{uploads.length > 0 && (
					<p className="small" style={{marginTop:4, marginBottom:6}}>
						LOG = analyzable, TUNE = reference only
					</p>
				)}
				{uploads.length > 0 && (
					<div className="row" style={{marginBottom:6}}>
						<button
							className="secondary"
							onClick={toggleAllUploadSelection}
							disabled={isUploading || isAnalyzing || isSwitchingRun}
						>
							{selectedUploadIds.length === uploads.length ? "Clear All Uploads" : "Select All Uploads"}
						</button>
						<span className="small">
							Selected: <b>{selectedUploadIds.length}</b> / {uploads.length}
						</span>
					</div>
				)}
				{uploads.length > 0 && (
					<ul className="small" style={{listStyle:"none",paddingLeft:0,marginTop:8}}>
						{uploads.map((u) => {
							const isLog = u.kind === "LOG";
							return (
							<li key={u.id} style={{display:"flex",alignItems:"center",gap:8,marginBottom:6,opacity:isLog ? 1 : 0.75}}>
								<input
									type="checkbox"
									checked={selectedUploadIds.includes(u.id)}
									onChange={() => toggleUploadSelection(u.id)}
									disabled={!isLog || isUploading || isAnalyzing || isSwitchingRun}
								/>
								<span>
									{u.filename} ({u.kind})
									{!isLog ? " — not used for Analyze" : ""}
								</span>
							</li>
							);
						})}
					</ul>
				)}

				<p className="small">Uploads selected for analysis: {selectedUploadIds.length}</p>
				<p className="small">Selected LOG uploads: {selectedLogUploadIds.length}</p>

				<div style={{ marginTop: 12 }}>
					<p className="small"><b>Run History:</b> {runs.length}</p>
					{runs.length > 0 && (
						<div className="row">
							{runs.map((r, idx) => (
								<button
									key={r.runId}
									className={r.runId === runId ? "" : "secondary"}
									disabled={isSwitchingRun && r.runId !== runId}
									onClick={() => {
										setIsSwitchingRun(true);
										setRunId(r.runId);
										setRunStatus(r);
										setStatusMsg(`Viewing run ${r.runId}.`);
									}}
								>
									{isSwitchingRun && r.runId === runId ? "Loading... " : ""}{idx === 0 ? "LATEST · " : ""}{r.runId.slice(0, 8)} {r.status}
									{r.startedAt ? ` · ${new Date(r.startedAt).toLocaleString()}` : ""}
								</button>
							))}
						</div>
					)}
				</div>

				<div style={{ marginTop: 12 }}>
					<p className="small"><b>Run status:</b> {runStatus ? `${runStatus.status}${runStatus.progress ? ` (${runStatus.progress.pct}% ${runStatus.progress.stage})` : ""}` : "Not started"}</p>
					{runId && (
						<div className="row" style={{alignItems:"center"}}>
							<p className="small" style={{margin:0}}><b>Run ID:</b> {runId}</p>
							<button className="secondary" onClick={onCopyRunLink} disabled={isSwitchingRun}>Copy Run Link</button>
						</div>
					)}
				</div>

				<div style={{ marginTop: 12 }}>
					<div className="row">
						<button
							onClick={onGenerateDiffset}
							disabled={!runId || runStatus?.status !== "SUCCEEDED" || !isGmLsEligible || isSwitchingRun || isGeneratingDiffset}
						>
							{isGeneratingDiffset ? "Generating..." : "Generate Diffset (GM LS P01/P59)"}
						</button>
					</div>
					{!isGmLsEligible && (
						<p className="small">Diffset generation is MVP-limited to GM LS with P01/P59.</p>
					)}
				</div>

				<div style={{ marginTop: 12 }}>
					{artifactsUpdatedAt && (
						<p className="small"><b>Artifacts updated:</b> {new Date(artifactsUpdatedAt).toLocaleString()}</p>
					)}
					<div className="row" style={{marginBottom:8}}>
						<button
							className="secondary"
							onClick={onRefreshArtifacts}
							disabled={isRefreshingArtifacts || isSwitchingRun}
						>
							{isRefreshingArtifacts ? "Refreshing..." : "Refresh Artifacts"}
						</button>
					</div>
					<p className="small"><b>Validation</b></p>
					<pre className="small" style={{ whiteSpace: "pre-wrap", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
						{validation ? pretty(validation) : "No validation yet."}
					</pre>
				</div>

				<div style={{ marginTop: 12 }}>
					<p className="small"><b>Findings</b></p>
					<pre className="small" style={{ whiteSpace: "pre-wrap", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12 }}>
						{findings ? pretty(findings) : "No findings yet."}
					</pre>
				</div>

				<div style={{ marginTop: 12 }}>
					<p className="small"><b>Diffsets</b>: {diffsets.length}</p>
					{diffsets.length > 0 && diffsets.map((d) => (
						<div key={d.diffSetId} className="card" style={{ marginBottom: 10, padding: 12 }}>
							<p className="small"><b>{d.name || "DiffSet"}</b> ({d.diffSetId.slice(0, 8)})</p>
							{d.itemCounts && (
								<p className="small">Items: {d.itemCounts.total} total, {d.itemCounts.approved} approved, {d.itemCounts.suggested} suggested, {d.itemCounts.rejected} rejected</p>
							)}
							<div className="row">
								<button className="secondary" onClick={() => onExportSummary(d.diffSetId)} disabled={summaryExportingId !== null || csvExportingId !== null || isSwitchingRun}>
									{summaryExportingId === d.diffSetId ? "Exporting Summary..." : "Export Summary"}
								</button>
								<button className="secondary" onClick={() => onExportCsv(d.diffSetId)} disabled={summaryExportingId !== null || csvExportingId !== null || isSwitchingRun}>
									{csvExportingId === d.diffSetId ? "Exporting CSV..." : "Export CSV"}
								</button>
							</div>
							{summaryByDiffSetId[d.diffSetId] && (
								<pre className="small" style={{ whiteSpace: "pre-wrap", background: "rgba(255,255,255,.03)", border: "1px solid rgba(255,255,255,.08)", borderRadius: 12, padding: 12, marginTop: 10 }}>
									{summaryByDiffSetId[d.diffSetId]}
								</pre>
							)}
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
