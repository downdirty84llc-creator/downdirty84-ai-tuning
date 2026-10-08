// Independently authored demonstration definitions. No ECU addresses or vendor data.
export const DEFINITION_SET = 'DD84_SIM_DEFINITIONS_V1';
const definitions = [
  {path:'Airflow.MAF.Curve',label:'MAF airflow',group:'Airflow',kind:'curve',unit:'g/s',min:0,max:5000,exclusiveMin:true,axes:[{label:'Frequency',unit:'Hz',min:0,max:30000}]},
  {path:'Airflow.VE.Map',label:'Volumetric efficiency',group:'Airflow',kind:'map',unit:'%',min:0,max:300,axes:[{label:'Engine speed',unit:'rpm',min:0,max:20000},{label:'Manifold pressure',unit:'kPa absolute',min:0,max:500}]},
  {path:'Spark.Advance.Map',label:'Spark advance',group:'Spark',kind:'map',unit:'degrees',min:-60,max:60,axes:[{label:'Engine speed',unit:'rpm',min:0,max:20000},{label:'Cylinder airmass',unit:'g/cyl',min:0,max:5}]},
  {path:'Idle.TargetSpeed',label:'Idle target speed',group:'Idle',kind:'scalar',unit:'rpm',min:0,max:4000,integer:true,axes:[]},
  {path:'Demo.TableSelection',label:'Example table selection',group:'Demonstration controls',kind:'enum',unit:'',choices:['PRIMARY','ALTERNATE'],axes:[]},
  {path:'Demo.Switch',label:'Example switch',group:'Demonstration controls',kind:'boolean',unit:'',axes:[]},
];
function freeze(value){if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;}
freeze(definitions);
export function definition(path){return definitions.find(d=>d.path===path)??null;}
