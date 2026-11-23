'use strict';
// Official Nasdaq OMXS30 components (Nasdaq November 2, 2026 fact sheet).
// Trading scope AG Invest from November 23, 2026; only these securities
// can enter NEW ranking/entry/stop/target proposals.
// https://www.nasdaq.com/docs/global-indexes/OMXS30
// Nasdaq November 23 notice: SOBI replaces LIFCO B effective December 1.
// Temporary SKFVER B spin-off November 26–30 is research-only pending
// verified 3-year OHLC history; do not silently treat it as a valid setup.
const AS_OF_2026_11_02 = Object.freeze([
  ['ABB.ST','ABB'],['ADDT-B.ST','Addtech'],['ALFA.ST','Alfa Laval'],
  ['ASSA-B.ST','Assa Abloy'],['AZN.ST','AstraZeneca'],['ATCO-A.ST','Atlas Copco'],
  ['BOL.ST','Boliden'],['EPI-A.ST','Epiroc'],['EQT.ST','EQT'],
  ['ERIC-B.ST','Ericsson'],['ESSITY-B.ST','Essity'],['EVO.ST','Evolution'],
  ['HM-B.ST','H&M'],['HEXA-B.ST','Hexagon'],['INDU-C.ST','Industrivärden'],
  ['INVE-B.ST','Investor'],['LIFCO-B.ST','Lifco'],['NIBE-B.ST','NIBE'],
  ['NDA-SE.ST','Nordea'],['SAAB-B.ST','Saab'],['SAND.ST','Sandvik'],
  ['SEB-A.ST','SEB'],['SKA-B.ST','Skanska'],['SKF-B.ST','SKF'],
  ['SCA-B.ST','SCA'],['SHB-A.ST','Handelsbanken'],['SWED-A.ST','Swedbank'],
  ['TEL2-B.ST','Tele2'],['TELIA.ST','Telia'],['VOLV-B.ST','Volvo'],
]);
function validDate(d) {
 return typeof d==='string' && /^\d{4}-\d{2}-\d{2}$/.test(d) &&
   !Number.isNaN(Date.parse(d+'T12:00:00Z')) &&
   new Date(d+'T12:00:00Z').toISOString().slice(0,10)===d;
}
function getMembersForSession(asOf) {
 if(!validDate(asOf) || asOf<'2026-11-02')
   throw Error('OMXS30 membership for historical session not verified; no new proposals');
 return AS_OF_2026_11_02.map(([symbol,name])=>
   asOf>='2026-12-01' && symbol==='LIFCO-B.ST' ? ['SOBI.ST','Sobi'] : [symbol,name]);
}
function exceptionsForSession(asOf) {
 if(!validDate(asOf))throw Error('valid completed session required');
 return asOf>='2026-11-26'&&asOf<'2026-12-01'
   ? [{symbol:'SKFVER-B.ST',reason:'Temporary index member; no full independent OHLC/OOS history'}]
   : [];
}
module.exports={AS_OF_2026_11_02,getMembersForSession,exceptionsForSession};
