// Candidate roles are export-label matches, not sensor authenticity or calibration definitions.
const roles=[
  {role:'RPM',names:['Engine RPM','Engine RPM (SAE)'],units:['rpm']},
  {role:'MAP',names:['Intake Manifold Absolute Pressure (SAE)','Manifold Absolute Pressure'],units:['psi','kPa']},
  {role:'COMMANDED_LAMBDA',names:['Equivalence Ratio Commanded (SAE)','Commanded Lambda'],units:['λ','lambda']},
  {role:'MEASURED_LAMBDA',names:['Wideband Lambda','Measured Lambda'],units:['λ','lambda']},
  {role:'MAF_FREQUENCY',names:['Mass Airflow Sensor','MAF Frequency','Mass Airflow Frequency'],units:['Hz']},
  {role:'MAF_MASS_FLOW',names:['Mass Airflow (SAE)','Mass Airflow'],units:['g/s']},
  {role:'INTAKE_TEMPERATURE',names:['Intake Air Temp','Intake Air Temp (SAE)'],units:['°F','°C']},
  {role:'COOLANT_TEMPERATURE',names:['Engine Coolant Temp','Engine Coolant Temp (SAE)'],units:['°F','°C']},
  {role:'KNOCK_RETARD',names:['Knock Retard','Total Knock Retard'],units:['°','deg']},
  {role:'SPARK_ADVANCE',names:['Timing Advance (SAE)','Spark Advance'],units:['°','deg']}
];
export function measurementChecks(inspection){
  const candidates=roles.map(def=>{
    const named=inspection.channels.filter(c=>def.names.includes(c.name));
    const matches=named.filter(c=>def.units.includes(c.unit));
    return {role:def.role,status:matches.length===0?'MISSING_OR_UNSUPPORTED_UNIT':matches.length>1?'AMBIGUOUS':'CANDIDATE_ONLY',candidates:matches.map(c=>({id:c.id,name:c.name,unit:c.unit,numericCount:c.numericCount,missingCount:c.missingCount,flags:[...(c.numericCount===0?['NO_FINITE_NUMERIC_SAMPLES']:[]),...(c.numericCount>0&&c.min===c.max?['CONSTANT_RECORDED_VALUE']:[]),...(c.textCount>0?['NONNUMERIC_VALUES_PRESENT']:[])]})),rejectedUnits:named.filter(c=>!def.units.includes(c.unit)).map(c=>({id:c.id,name:c.name,unit:c.unit,expectedUnits:def.units}))};
  });
  return {format:'DD84_MEASUREMENT_CHECKS_V1',status:'REQUIRES_SENSOR_REVIEW',mappingBasis:'EXACT_EXPORT_LABEL_AND_UNIT_ONLY',candidates,learningReady:false,automaticApplication:false,blockedReasons:['Candidate labels do not verify sensor wiring, calibration, accuracy or physical source.','Duplicate candidates require operator selection; no channel is selected automatically.','Export rows are asynchronous; no time alignment, interpolation or sensor delay correction is implemented.','Measured wideband lambda and airflow attribution must be validated before MAF/VE corrections.','VE table definitions, operating coordinates and fuel-system checks are not supplied by this log.','Timing optimization requires validated knock and controlled torque evidence; spark advance is not knock retard.'],notes:['Constant values are flagged for review, not declared failed sensors.','MAP and temperature units remain as exported; no conversions are performed.','Unknown labels remain in the channel inventory; absence of a match does not prove absence of a sensor.']};
}
export function measurementCheckText(checks){
  return checks.candidates.map(r=>r.role+': '+r.status+(r.candidates.length?'\n'+r.candidates.map(c=>'  '+c.name+' ['+c.unit+'] (channel '+c.id+'): '+c.numericCount+' numeric samples'+(c.flags.length?' — '+c.flags.join(', '):'')).join('\n'):'')+(r.rejectedUnits.length?'\n'+r.rejectedUnits.map(c=>'  Unit mismatch: '+c.name+' ['+(c.unit||'not supplied')+']; expected '+c.expectedUnits.join(' or ')).join('\n'):'')).join('\n\n')+'\n\nLearning remains blocked:\n'+checks.blockedReasons.join('\n');
}
