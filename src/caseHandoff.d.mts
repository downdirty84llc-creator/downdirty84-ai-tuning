import type {CaseReport} from '../backend/shared/troubleshooting.mjs';
export type CaseHandoffReference={jobId:string;caseId:string;access:'customer'|'shop'};
export function parseCaseHandoffSearch(search:string):CaseHandoffReference|null;
export function caseHandoffHref(value:CaseHandoffReference):string;
export function caseHandoffPath(value:CaseHandoffReference):string;
export function readHandoffSnapshot(value:unknown,requested:CaseHandoffReference):{id:string;jobId:string;createdAt:string;sha256:string;report:CaseReport};
