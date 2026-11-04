import type {MeasuredReview} from '../../../backend/shared/measuredReview.mjs';
export function renderMeasuredReview(root:HTMLElement,input:MeasuredReview|null):void;
export function mountMeasuredReview(root:HTMLElement,options:{onAttach:(report:MeasuredReview|null)=>void;onDirty:()=>void}):{set:(report:MeasuredReview|null)=>void;hasDraft:()=>boolean;dispose:()=>void};
