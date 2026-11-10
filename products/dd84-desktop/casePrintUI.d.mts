export function openCasePrintPreview(input: unknown, options?: {isCurrent?:()=>boolean;returnFocus?:Element|null}): Promise<()=>void>;
export function mountCasePrint(root: HTMLElement, getCase:()=>unknown, options?: {getRevision?:()=>number}): ()=>void;
