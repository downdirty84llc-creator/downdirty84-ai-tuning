export type CaseOpenDecision='opened'|'kept'|'superseded'|'canceled';
export type TroubleshootingWorkspace=(()=>void)&{
  getOpenVersion:()=>number;
  openCase:(value:unknown,options?:{label?:string;onDecision?:(decision:CaseOpenDecision)=>void})=>()=>void;
};
export function mountTroubleshooting(root: HTMLElement, options: {save: (value: unknown, filename: string) => Promise<{status: string}>; externalLinks?: boolean;onLocalCaseOpened?:()=>void}): TroubleshootingWorkspace;
