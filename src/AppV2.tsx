import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BarChart3,
  TrendingUp,
  ShieldAlert,
  FileText,
  X,
  Plus,
  Minus,
  ChevronDown,
  ChevronUp,
  Activity,
  Sliders,
  DollarSign,
  Clock,
  Printer,
  List,
  Zap,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Bar,
  ComposedChart,
  Label,
} from 'recharts';

import { runSimulation, optimizeRebalancingTargets } from './utils/financeV2';
import type { SimulationInputs, SimulationRecord, OptimizedStrategy, HistoricalDataRecord } from './utils/financeV2';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const HEX = {
  bg: '#05070A',
  accent: '#00F2FE',
  debt: '#7367F0',
  alt: '#32CC6D',
  expense: '#FF4D4D',
  text: '#FFFFFF',
  textDim: '#8E9AAF',
  eqSource: '#00C8FF',
  dbSource: '#9B59B6',
  altSource: '#2ECC71',
  taxBar: '#FF6B35',
  optimized: '#00FF88',
};

const formatToCrores = (valInRupees: number) => {
  if (valInRupees < 0) return '₹ 0.00 Cr';
  const crores = valInRupees / 1e7;
  return `₹ ${crores.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Cr`;
};

const formatLakhs = (valInRupees: number) => {
  if (valInRupees <= 0) return '–';
  return `₹ ${(valInRupees / 1e5).toFixed(2)} L`;
};

const formatAxisCrores = (valInRupees: number) => (valInRupees / 1e7).toFixed(1);

const HeaderStyle = 'text-[12px] font-black uppercase tracking-[0.3em] text-accent/80 border-b border-white/5 pb-3 mb-5 block';

export default function App() {
  const [showYieldNotice, setShowYieldNotice] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(0.9);
  const [activePanel, setActivePanel] = useState<string | null>('macro');
  const [showRebalanceModal, setShowRebalanceModal] = useState(false);
  const [disclaimerAgreed, setDisclaimerAgreed] = useState(false);
  const [activePhaseTab, setActivePhaseTab] = useState<1 | 2 | 3>(1);

  // V0.4: strategy mode toggle
  const [strategyMode, setStrategyMode] = useState<'manual' | 'optimized'>('manual');
  const [optimizedResult, setOptimizedResult] = useState<OptimizedStrategy | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  const togglePanel = (panelKey: string) => {
    setActivePanel(prev => (prev === panelKey ? null : panelKey));
  };

  // State Inputs (V2.0 Upgraded)
  const [inputs, setInputs] = useState<SimulationInputs>({
    currentAge: 25,
    retirementAge: 60,
    endAge: 85,
    domesticEquity: 5,
    intlEquity: 0,
    fdAssets: 2.5,
    debtMfAssets: 2.5,
    goldAssets: 1,
    silverAssets: 1,
    annualSavings: 4,
    incomeGrowthRate: 7,
    monthlyExpenses: 0.25,
    medicalInsurance: 0.25,
    rebalanceYears: 5,
    phase1Alloc: { equity: 40, debt: 50 },
    phase2Alloc: { equity: 30, debt: 60 },
    phase3Alloc: { equity: 10, debt: 80 },
    macroRegime: 'india',
    runMode: 'forecast',
    historicalStartYear: 1986,
    altsEnabled: true
  });

  const [indiaData, setIndiaData] = useState<HistoricalDataRecord[]>([]);
  const [chinaData, setChinaData] = useState<HistoricalDataRecord[]>([]);
  const [japanData, setJapanData] = useState<HistoricalDataRecord[]>([]);
  const [isLoadingCSV, setIsLoadingCSV] = useState(false);

  const parseCSV = (csvText: string): HistoricalDataRecord[] => {
    const lines = csvText.split('\n');
    const records: HistoricalDataRecord[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(',');
      if (parts.length < 9) continue;
      records.push({
        Year: parseInt(parts[0], 10),
        Sensex: parseFloat(parts[1]),
        USD_INR: parseFloat(parts[2]),
        Gold: parseFloat(parts[3]),
        Property: parseFloat(parts[4]),
        Sensex_Rebased: parseFloat(parts[5]),
        USD_INR_Rebased: parseFloat(parts[6]),
        Gold_Rebased: parseFloat(parts[7]),
        Property_Rebased: parseFloat(parts[8]),
      });
    }
    return records;
  };

  useEffect(() => {
    const loadData = async () => {
      setIsLoadingCSV(true);
      try {
        const base = import.meta.env.BASE_URL ? (import.meta.env.BASE_URL.endsWith('/') ? import.meta.env.BASE_URL : `${import.meta.env.BASE_URL}/`) : './';
        const [resIn, resCh, resJp] = await Promise.all([
          fetch(`${base}historical_asset_data_clean.csv`).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          }),
          fetch(`${base}historical_asset_data_china.csv`).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          }),
          fetch(`${base}historical_asset_data_japan.csv`).then(r => {
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            return r.text();
          })
        ]);
        setIndiaData(parseCSV(resIn));
        setChinaData(parseCSV(resCh));
        setJapanData(parseCSV(resJp));
      } catch (err) {
        console.error('Error fetching historical CSVs:', err);
      } finally {
        setIsLoadingCSV(false);
      }
    };
    loadData();
  }, []);

  const [stressParams, setStressParams] = useState({
    mktReturn: 12,
    illFreq: 10,
    illAmt: 5,
  });

  const [enableRebalance, setEnableRebalance] = useState(true);
  const [enableStress, setEnableStress] = useState(true);

  // V0.4: three-way view mode
  const [viewMode, setViewMode] = useState<'chart' | 'decumulation' | 'audit' | 'rebalanceReport'>('chart');

  useEffect(() => {
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowYieldNotice(false);
        setShowOnboarding(false);
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // Reset to manual when inputs/stress change
  useEffect(() => {
    setStrategyMode('manual');
    setOptimizedResult(null);
  }, [inputs.currentAge, inputs.retirementAge, inputs.endAge,
      inputs.domesticEquity, inputs.intlEquity, inputs.fdAssets, inputs.debtMfAssets,
      inputs.goldAssets, inputs.silverAssets, inputs.annualSavings, inputs.rebalanceYears,
      inputs.incomeGrowthRate, inputs.monthlyExpenses, inputs.medicalInsurance,
      inputs.macroRegime, inputs.runMode, inputs.historicalStartYear, inputs.altsEnabled,
      stressParams.mktReturn, stressParams.illFreq, stressParams.illAmt,
      enableStress]);

  // Effective allocations (manual or optimized)
  const effectiveInputs: SimulationInputs = useMemo(() => {
    if (strategyMode === 'optimized' && optimizedResult) {
      return {
        ...inputs,
        phase1Alloc: optimizedResult.phase1Alloc,
        phase2Alloc: optimizedResult.phase2Alloc,
        phase3Alloc: optimizedResult.phase3Alloc,
        rebalanceYears: optimizedResult.rebalanceYears, // Use optimized rebalancing staging period!
      };
    }
    return inputs;
  }, [inputs, strategyMode, optimizedResult]);

  // Sourcing of active country historical series
  const activeHistoricalData = useMemo(() => {
    if (inputs.macroRegime === 'china') return chinaData;
    if (inputs.macroRegime === 'japan') return japanData;
    return indiaData;
  }, [inputs.macroRegime, indiaData, chinaData, japanData]);

  // Main simulation
  const simulationData = useMemo(() => {
    const mktVal = enableStress ? stressParams.mktReturn : 12;
    const illF   = enableStress ? stressParams.illFreq   : 999;
    const illA   = enableStress ? stressParams.illAmt    : 0;
    const raw = runSimulation(mktVal, effectiveInputs, illF, illA, enableRebalance, activeHistoricalData);
    const zeroIndex = raw.records.findIndex(r => r.Balance <= 0);
    if (zeroIndex !== -1) {
      return { ...raw, records: raw.records.slice(0, zeroIndex + 2) };
    }
    return raw;
  }, [effectiveInputs, stressParams, enableRebalance, enableStress, activeHistoricalData]);

  const isSolventAtEnd = simulationData.outAge >= inputs.endAge;

  // Post-retirement slice for decumulation chart
  const decumRecords: SimulationRecord[] = useMemo(() =>
    simulationData.records.filter(r => r.Age >= inputs.retirementAge),
    [simulationData.records, inputs.retirementAge]
  );

  // Portfolio totals
  const totalCurrent = inputs.domesticEquity + inputs.intlEquity + inputs.fdAssets + inputs.debtMfAssets + inputs.goldAssets + inputs.silverAssets;
  const currentEqPct  = totalCurrent > 0 ? ((inputs.domesticEquity + inputs.intlEquity) / totalCurrent) * 100 : 0;
  const currentDbPct  = totalCurrent > 0 ? ((inputs.fdAssets + inputs.debtMfAssets) / totalCurrent) * 100 : 0;
  const currentOtPct  = totalCurrent > 0 ? ((inputs.goldAssets + inputs.silverAssets) / totalCurrent) * 100 : 0;

  // Cumulative tax in post-retirement
  const totalTaxDrag = useMemo(() =>
    decumRecords.reduce((s, r) => s + r.LTCGTaxPaid + r.SlabTaxPaid, 0),
    [decumRecords]
  );

  // V0.4 - Rebalancing Strategy & Tax Savings Report Calculation
  const taxSavingsReport = useMemo(() => {
    const lumpSumInputs = { ...effectiveInputs, rebalanceYears: 1 };
    const mktVal = enableStress ? stressParams.mktReturn : 12;
    const illF   = enableStress ? stressParams.illFreq   : 999;
    const illA   = enableStress ? stressParams.illAmt    : 0;
    
    // Simulate Lump Sum
    const lsResult = runSimulation(mktVal, lumpSumInputs, illF, illA, enableRebalance, activeHistoricalData);
    
    const lsTax = lsResult.records.reduce((s, r) => s + r.LTCGTaxPaid + r.SlabTaxPaid, 0);
    const activeTax = simulationData.records.reduce((s, r) => s + r.LTCGTaxPaid + r.SlabTaxPaid, 0);
    
    return {
      lumpSumTax: lsTax,
      activeTax: activeTax,
      savedTax: Math.max(0, lsTax - activeTax),
      lumpSumSolvency: lsResult.outAge,
      activeSolvency: simulationData.outAge,
      solvencyGain: Math.max(0, simulationData.outAge - lsResult.outAge),
      lumpSumFinalBalance: lsResult.records[lsResult.records.length - 1]?.Balance ?? 0,
      activeFinalBalance: simulationData.records[simulationData.records.length - 1]?.Balance ?? 0
    };
  }, [effectiveInputs, stressParams, enableStress, enableRebalance, simulationData, activeHistoricalData]);

  const handleExportPDF = () => window.print();

  // V0.4 Optimizer trigger
  const handleOptimize = useCallback(() => {
    setIsOptimizing(true);
    // Defer to next tick so spinner renders
    setTimeout(() => {
      const result = optimizeRebalancingTargets(inputs, stressParams, enableStress);
      setOptimizedResult(result);
      setStrategyMode('optimized');
      setIsOptimizing(false);
    }, 30);
  }, [inputs, stressParams, enableStress]);

  return (
    <div className="bg-background text-white min-h-screen font-sans select-none print:bg-white print:text-black print:min-h-0 print:h-auto overflow-x-hidden">

      {/* ========================================================
          1. PRINT-ONLY REPORT VIEW (V0.4)
          ======================================================== */}
      <div className="hidden print:block text-black p-8 space-y-10 bg-white w-full h-auto overflow-visible">
        <div className="text-center border-b-[2px] border-black pb-4 relative">
          <h1 className="text-xl font-black uppercase tracking-widest">FinPlan Suite V0.4 Intelligence Audit</h1>
          <p className="text-[9px] font-bold opacity-60 uppercase tracking-[0.25em] mt-1">
            FY 2025-26 · Tax-Aware Decumulation Ledger · {strategyMode === 'optimized' ? '⚡ Optimized Strategy' : 'Manual Strategy'}
          </p>
          <div className="flex justify-between items-center text-[8px] font-black uppercase tracking-widest mt-2 text-black/50">
            <span>© Earthscapes Digital 2026</span>
            <span>Free for personal use only</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 border border-black/10 p-5 rounded-xl bg-gray-50/50 text-xs">
          <div className="space-y-1">
            <span className="text-[9px] font-black uppercase tracking-widest text-black/50">Projection Parameters</span>
            <ul className="space-y-0.5 font-bold">
              <li>Current Age: {inputs.currentAge} Years</li>
              <li>Retirement Horizon: {inputs.retirementAge} Years</li>
              <li>Life Expectancy Target: {inputs.endAge} Years</li>
              <li>Initial Capital: ₹ {totalCurrent.toFixed(1)} Lakhs</li>
              <li>Strategy: {strategyMode === 'optimized' ? '⚡ Optimized' : 'Manual'}</li>
            </ul>
          </div>
          <div className="space-y-1 text-right flex flex-col justify-center">
            <span className="text-[9px] font-black uppercase tracking-widest text-black/50 font-mono">Lifespan Duration Status</span>
            <div className="text-xl font-black text-black">
              {isSolventAtEnd ? `SECURED (${inputs.endAge}+ YRS)` : `LIQUIDATED AGE ${simulationData.outAge}`}
            </div>
            <div className="text-[9px] font-black text-black/50 mt-2">
              Cumulative Post-Retirement Tax Drag: {formatToCrores(totalTaxDrag)}
            </div>
          </div>
        </div>

        {/* Print Chart 1: Capital Longevity Path */}
        <div className="space-y-2">
          <h2 className="text-xs font-black uppercase tracking-widest">1. Capital Longevity Path</h2>
          <div className="h-[260px] w-full border border-black/10 p-3 rounded-xl bg-white flex items-center justify-center">
            <ComposedChart width={720} height={240} data={simulationData.records} margin={{ bottom: 15, left: 5, right: 5, top: 5 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
              <XAxis dataKey="Age" axisLine={false} tickLine={false} tick={{ fill: '#000', fontSize: 9 }}>
                <Label value="Age" offset={-10} position="insideBottom" fill="#000" fontSize={9} fontWeight={900} />
              </XAxis>
              <YAxis domain={[0, 'auto']} axisLine={false} tickLine={false} tick={{ fill: '#000', fontSize: 9 }} tickFormatter={formatAxisCrores}>
                <Label value="₹ Crores" angle={-90} position="insideLeft" fill="#000" fontSize={8} fontWeight={900} offset={-2} />
              </YAxis>
              <Area type="monotone" dataKey="Balance" stroke="#000" strokeWidth={2} fillOpacity={0.05} fill="#000" />
              <Area type="monotone" dataKey="Expense" stroke="#CC2200" strokeWidth={1.5} strokeDasharray="4 4" fill="none" />
              {enableStress && <Bar dataKey="Shock" fill="#ff0000" radius={[1, 1, 0, 0]} barSize={6} />}
            </ComposedChart>
          </div>
          {/* Legend */}
          <div className="flex gap-6 text-[8px] font-black uppercase tracking-widest text-black/60 pl-2">
            <div className="flex items-center gap-1.5"><div className="w-5 h-0.5 bg-black inline-block"></div> Portfolio Balance (Crores)</div>
            <div className="flex items-center gap-1.5"><div className="w-5 h-0" style={{borderTop: '1.5px dashed #CC2200'}}></div> Core Expense Burn</div>
            {enableStress && <div className="flex items-center gap-1.5"><div className="w-3 h-3 bg-red-600 rounded-sm inline-block"></div> Crisis Shock Event</div>}
          </div>
        </div>

        {/* Print Chart 2: Decumulation Flows */}
        {decumRecords.length > 0 && (
          <div className="space-y-2">
            <h2 className="text-xs font-black uppercase tracking-widest">2. Post-Retirement Decumulation Flows</h2>
            <div className="h-[220px] w-full border border-black/10 p-3 rounded-xl bg-white flex items-center justify-center">
              <ComposedChart width={720} height={200} data={decumRecords} margin={{ bottom: 15, left: 5, right: 5, top: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.08)" />
                <XAxis dataKey="Age" axisLine={false} tickLine={false} tick={{ fill: '#000', fontSize: 9 }}>
                  <Label value="Age" offset={-10} position="insideBottom" fill="#000" fontSize={9} fontWeight={900} />
                </XAxis>
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#000', fontSize: 9 }} tickFormatter={(v) => (v / 1e5).toFixed(1)}>
                  <Label value="₹ Lakhs" angle={-90} position="insideLeft" fill="#000" fontSize={8} fontWeight={900} offset={-2} />
                </YAxis>
                <Area type="monotone" dataKey="EqSourced"  stackId="src" stroke="#0080AA" strokeWidth={1} fill="#CCF0FF" fillOpacity={0.9} />
                <Area type="monotone" dataKey="DbSourced"  stackId="src" stroke="#4A3080" strokeWidth={1} fill="#C8BFFF" fillOpacity={0.9} />
                <Area type="monotone" dataKey="AltSourced" stackId="src" stroke="#1A7040" strokeWidth={1} fill="#B2EDCC" fillOpacity={0.9} />
                <Bar dataKey="LTCGTaxPaid" fill="#CC3300" radius={[2, 2, 0, 0]} barSize={5} />
                <Bar dataKey="SlabTaxPaid" fill="#880000" radius={[2, 2, 0, 0]} barSize={5} />
              </ComposedChart>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-5 text-[8px] font-black uppercase tracking-widest text-black/60 pl-2">
              <div className="flex items-center gap-1.5"><div className="w-4 h-3 rounded-sm" style={{backgroundColor:'#CCF0FF', border:'1px solid #0080AA'}}></div> Equity Drawn (incl. LTCG harvest)</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-3 rounded-sm" style={{backgroundColor:'#C8BFFF', border:'1px solid #4A3080'}}></div> Debt Drawn</div>
              <div className="flex items-center gap-1.5"><div className="w-4 h-3 rounded-sm" style={{backgroundColor:'#B2EDCC', border:'1px solid #1A7040'}}></div> Alts / Bullion Drawn</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{backgroundColor:'#CC3300'}}></div> LTCG Tax Paid</div>
              <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm" style={{backgroundColor:'#880000'}}></div> Slab Tax Paid</div>
            </div>
          </div>
        )}

        {/* Print Rebalancing Strategy Report */}
        {enableRebalance && (
          <div className="space-y-3 p-4 border border-black/10 rounded-xl bg-gray-50/50">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-black/80 flex items-center gap-1.5 border-b border-black/10 pb-1">
              ⚖️ Rebalancing Strategy &amp; Tax Efficiency Report
            </h2>
            <p className="text-[8px] font-semibold text-black/60 leading-relaxed">
              This report analyzes the tax drag and solvency benefits of transitioning milestones (retirement and aged adjustments) gradually over a {effectiveInputs.rebalanceYears}-year staged glide path instead of in a single lump-sum year. Spreading the transition allows the model to harness the annual ₹1.25L LTCG tax-free exemption multiple times, shielding assets from immediate slab and capital gains taxes.
            </p>
            <div className="grid grid-cols-2 gap-4 text-[8px] font-mono">
              <div className="border border-black/10 p-2.5 rounded-lg space-y-1 bg-white">
                <div className="font-sans font-black uppercase tracking-wider text-black/40">Lump-Sum (1-Yr) Transition</div>
                <div>Lifetime Tax Outgo: <strong>{formatLakhs(taxSavingsReport.lumpSumTax)}</strong></div>
                <div>Portfolio Solvency Lifespan: <strong>Age {taxSavingsReport.lumpSumSolvency}</strong></div>
                <div>Final Portfolio Value ({inputs.endAge}): <strong>{formatToCrores(taxSavingsReport.lumpSumFinalBalance)}</strong></div>
              </div>
              <div className="border border-black/10 p-2.5 rounded-lg space-y-1 bg-white">
                <div className="font-sans font-black uppercase tracking-wider text-black/80 flex items-center gap-1 text-green-700">
                  {strategyMode === 'optimized' ? '⚡ Optimized Glide Path' : 'Staged Glide Path'} ({effectiveInputs.rebalanceYears}-Yr)
                </div>
                <div>Lifetime Tax Outgo: <strong>{formatLakhs(taxSavingsReport.activeTax)}</strong></div>
                <div>Portfolio Solvency Lifespan: <strong>Age {taxSavingsReport.activeSolvency}</strong></div>
                <div>Final Portfolio Value ({inputs.endAge}): <strong>{formatToCrores(taxSavingsReport.activeFinalBalance)}</strong></div>
              </div>
            </div>
            
            {/* Mathematical Note */}
            <div className="p-2 bg-blue-50/50 border border-blue-200/30 rounded-lg text-[7px] leading-relaxed text-blue-900 font-medium">
              <span className="font-bold text-blue-950 uppercase tracking-wide block mb-0.5">💡 Mathematical Note on Net Compound Wealth vs. Absolute Tax outgo:</span>
              The Solvency Optimizer maximizes your <strong>Net Compound Portfolio Value (Total Gains minus Tax Paid)</strong> to achieve the longest possible solvency lifespan, not absolute tax minimization in isolation. Gliding keeps a larger portion of your assets compounding in high-growth Equity (12% CAGR) longer instead of shifting prematurely to lower-yield Debt. This generates substantially more total lifetime gains. Consequently, while the absolute lifetime tax paid can be slightly higher in some scenarios due to significantly larger overall returns, your <strong>Final Net Wealth</strong> is substantially higher (as shown in the Final Portfolio Value above), resulting in a much stronger net financial outcome!
            </div>

            {/* Vector Flowchart Diagram */}
            <div className="pt-1">
              <svg viewBox="0 0 420 100" className="w-full h-auto text-black border border-black/5 rounded-lg bg-white/50 p-2">
                {/* Pathway 1: Lump Sum */}
                <text x="10" y="16" className="text-[8px] font-black uppercase fill-black/60">Lump-Sum (1-Yr) Transition</text>
                <rect x="10" y="22" width="105" height="16" rx="3" fill="#f3f4f6" stroke="#e5e7eb" strokeWidth="1" />
                <text x="62.5" y="32" textAnchor="middle" className="text-[7px] font-bold fill-black/80">Immediate De-risking</text>
                
                <line x1="115" y1="30" x2="135" y2="30" stroke="#9ca3af" strokeWidth="1.2" markerEnd="url(#arrow)" />
                
                <rect x="135" y="22" width="125" height="16" rx="3" fill="#f3f4f6" stroke="#e5e7eb" strokeWidth="1" />
                <text x="197.5" y="32" textAnchor="middle" className="text-[7px] font-bold fill-black/80">Lower growth (8.2% Debt)</text>
                
                <line x1="260" y1="30" x2="280" y2="30" stroke="#9ca3af" strokeWidth="1.2" markerEnd="url(#arrow)" />
                
                <rect x="280" y="22" width="130" height="16" rx="3" fill="#fee2e2" stroke="#fca5a5" strokeWidth="1" />
                <text x="345" y="32" textAnchor="middle" className="text-[7px] font-black fill-red-800">Lower Ending Portfolio</text>

                {/* Pathway 2: Staged Glide Path */}
                <text x="10" y="62" className="text-[8px] font-black uppercase fill-green-800">Staged Glide Path ({effectiveInputs.rebalanceYears}-Yr)</text>
                <rect x="10" y="68" width="105" height="16" rx="3" fill="#f0fdf4" stroke="#bbf7d0" strokeWidth="1" />
                <text x="62.5" y="78" textAnchor="middle" className="text-[7px] font-bold fill-green-800">Gradual Linear Glide</text>
                
                <line x1="115" y1="76" x2="135" y2="76" stroke="#22c55e" strokeWidth="1.2" markerEnd="url(#arrow-green)" />
                
                <rect x="135" y="68" width="125" height="16" rx="3" fill="#ecfeff" stroke="#a5f3fc" strokeWidth="1" />
                <text x="197.5" y="78" textAnchor="middle" className="text-[7px] font-bold fill-cyan-850">Stay in Equity (12% CAGR) longer</text>
                
                <line x1="260" y1="76" x2="280" y2="76" stroke="#22c55e" strokeWidth="1.2" markerEnd="url(#arrow-green)" />
                
                <rect x="280" y="68" width="130" height="16" rx="3" fill="#dcfce7" stroke="#86efac" strokeWidth="1" />
                <text x="345" y="78" textAnchor="middle" className="text-[7px] font-black fill-green-800">⚡ HIGHER NET WEALTH (Winner!)</text>

                {/* SVG Marker Definitions */}
                <defs>
                  <marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#9ca3af" />
                  </marker>
                  <marker id="arrow-green" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#22c55e" />
                  </marker>
                </defs>
              </svg>
            </div>
            
            <div className="flex gap-4">
              {taxSavingsReport.savedTax > 0 && (
                <div className="flex-1 text-[8px] font-black bg-green-50 text-green-800 p-2 rounded-lg border border-green-200/50 flex justify-between">
                  <span>🔥 Net Lifetime Taxes Saved:</span>
                  <span>{formatLakhs(taxSavingsReport.savedTax)}</span>
                </div>
              )}
              {taxSavingsReport.solvencyGain > 0 && (
                <div className="flex-1 text-[8px] font-black bg-blue-50 text-blue-800 p-2 rounded-lg border border-blue-200/50 flex justify-between">
                  <span>🚀 Extra Capital Solvency Lifespan:</span>
                  <span>+{taxSavingsReport.solvencyGain} Years</span>
                </div>
              )}
            </div>
          </div>
        )}

        <div style={{ pageBreakBefore: 'always' }} />

        {/* Print Full Ledger - All columns matching on-screen Ledger */}
        <div className="space-y-3 overflow-visible h-auto">
          <h2 className="text-xs font-black uppercase tracking-widest">3. Cashflow &amp; Tax Ledger (V0.4 — All Columns)</h2>
          <table className="w-full text-left border-collapse border border-black/10 text-[7px] overflow-visible h-auto">
            <thead>
              {/* Group header */}
              <tr className="bg-gray-50 text-[7px] font-black uppercase">
                <th colSpan={8} className="p-1 border-r border-black/10 text-black/40">Portfolio &amp; Cashflow</th>
                <th colSpan={6} className="p-1 text-[#8B3000]">▸ Expense Funds (post-retirement sourcing)</th>
              </tr>
              <tr className="bg-gray-100 uppercase font-black border-b border-black/10 text-black/70">
                <th className="p-1 border-r border-black/5">Age</th>
                <th className="p-1 border-r border-black/5">Net Portfolio</th>
                <th className="p-1 border-r border-black/5 text-[#007AA0]">Equity</th>
                <th className="p-1 border-r border-black/5 text-[#4A3080]">Debt</th>
                <th className="p-1 border-r border-black/5 text-[#1A7040]">Other</th>
                <th className="p-1 border-r border-black/5 text-[#007040]">Income</th>
                <th className="p-1 border-r border-black/5">Expenses</th>
                <th className="p-1 border-r border-black/10">Crisis</th>
                <th className="p-1 border-r border-black/5 text-[#007AA0]">Eq Sourced</th>
                <th className="p-1 border-r border-black/5 text-[#4A3080]">Db Sourced</th>
                <th className="p-1 border-r border-black/5 text-[#1A7040]">Alt Sourced</th>
                <th className="p-1 border-r border-black/5 text-[#005020]">LTCG Exempt</th>
                <th className="p-1 border-r border-black/5 text-[#CC3300]">LTCG Tax</th>
                <th className="p-1 text-[#660000]">Slab Tax</th>
              </tr>
            </thead>
            <tbody className="font-semibold text-black">
              {simulationData.records.map((row) => {
                const isPost = row.Age >= inputs.retirementAge;
                return (
                  <tr key={row.Age} className={`border-b border-black/5 ${isPost ? 'bg-gray-50/50' : ''}`}>
                    <td className="p-1 border-r border-black/5 font-black whitespace-nowrap">{row.Age} ({row.Year}){isPost ? ' R' : ''}</td>
                    <td className="p-1 border-r border-black/5 font-mono font-black">{formatToCrores(row.Balance)}</td>
                    <td className="p-1 border-r border-black/5 font-mono">{formatToCrores(row.Equity)}</td>
                    <td className="p-1 border-r border-black/5 font-mono cursor-help" title={`FD: ${formatToCrores(row.DebtFD)}\nMF: ${formatToCrores(row.DebtMF)}`}>{formatToCrores(row.Debt)}</td>
                    <td className="p-1 border-r border-black/5 font-mono">{formatToCrores(row.Other)}</td>
                    <td className="p-1 border-r border-black/5 font-mono text-[#007040]">{!isPost && row.IncomeAdded > 0 ? formatLakhs(row.IncomeAdded) : '–'}</td>
                    <td className="p-1 border-r border-black/5 font-mono">{formatToCrores(row.Expense)}</td>
                    <td className="p-1 border-r border-black/10 font-mono text-red-600">{row.Shock > 0 ? formatToCrores(row.Shock) : '–'}</td>
                    <td className="p-1 border-r border-black/5 font-mono">{isPost ? formatLakhs(row.EqSourced) : '–'}</td>
                    <td className="p-1 border-r border-black/5 font-mono">{isPost ? formatLakhs(row.DbSourced) : '–'}</td>
                    <td className="p-1 border-r border-black/5 font-mono">{isPost ? formatLakhs(row.AltSourced) : '–'}</td>
                    <td className="p-1 border-r border-black/5 font-mono text-green-700">{isPost ? formatLakhs(row.LTCGExempted) : '–'}</td>
                    <td className="p-1 border-r border-black/5 font-mono text-red-600">{row.LTCGTaxPaid > 0 ? formatLakhs(row.LTCGTaxPaid) : '–'}</td>
                    <td className="p-1 font-mono text-red-800">{row.SlabTaxPaid > 0 ? formatLakhs(row.SlabTaxPaid) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ========================================================
          2. WEB ACTIVE DASHBOARD VIEW (V0.4)
          ======================================================== */}
      <div className="flex flex-col h-screen print:hidden overflow-hidden">

        {/* Startup / Disclaimer Modal */}
        {showYieldNotice && (
          <div className="fixed inset-0 z-[400] bg-black/95 flex items-center justify-center p-10 animate-in fade-in duration-500">
            <div className="max-w-xl w-full glass p-8 border-accent/20 relative">
              <div className="text-center space-y-6">
                <h2 className="text-xl font-black uppercase tracking-widest text-[#00F2FE]">FinPlan Suite V0.4</h2>
                <div className="space-y-6 text-left border-y border-white/5 py-6 my-6 max-h-[50vh] overflow-y-auto pr-4 custom-scrollbar">
                  <p className="text-[11px] font-black uppercase tracking-[0.2em] text-accent mb-4">Conservative Future Expected Returns</p>

                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-6 font-sans mb-8">
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-accent opacity-50">Equities</span>
                      <div className="text-base font-black">12.0% yield</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#7367F0] opacity-50">Debt / Fixed</span>
                      <div className="text-base font-black">8.2% yield</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#32CC6D] opacity-50">Bullion</span>
                      <div className="text-base font-black">7.5% yield</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Inflation</span>
                      <div className="text-base font-black">7.0% CAGR</div>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] font-black uppercase tracking-widest text-[#FF4D4D] opacity-50">Med. Inflation</span>
                      <div className="text-base font-black">15.0% CAGR</div>
                    </div>
                  </div>

                  <div className="space-y-6 text-xs leading-relaxed text-white/70">
                    <div className="p-4 bg-white/5 rounded-xl border border-white/10 italic">
                      "To build a plan that survives reality rather than one that looks good on a spreadsheet, you must transition from 'Historical Averages' to 'Future Expected Returns.'"
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-black text-white uppercase tracking-widest text-[10px]">Planning Logic (Net of Tax/Fees)</h3>
                      <ul className="space-y-2 opacity-80 list-disc pl-4">
                        <li><strong className="text-white">Annual Inflation (7.0%):</strong> RBI CPI standard.</li>
                        <li><strong className="text-white">Medical Inflation (15.0%):</strong> 14% base + age jumps. Reference: Mercer Marsh.</li>
                        <li><strong className="text-white">Equity CAGR (12.0%):</strong> Long-term Indian mature market standard.</li>
                        <li><strong className="text-white">Debt CAGR (8.2%):</strong> Conservative solvency limit yield.</li>
                      </ul>
                    </div>
                    <div className="space-y-4">
                      <h3 className="font-black text-white uppercase tracking-widest text-[10px]">Taxation (New Regime FY 2025-26)</h3>
                      <div className="p-4 bg-white/5 rounded-xl border border-white/10 space-y-3">
                        <ul className="space-y-1.5 opacity-80 list-disc pl-4">
                          <li>₹75,000 Standard Deduction; Section 87A rebate: effective 0% tax for income ≤ ₹12L (new regime).</li>
                          <li>Budget 2025 Slabs: 0–4L (0%), 4–8L (5%), 8–12L (10%), 12–16L (15%), 16–20L (20%), 20–24L (25%), &gt;24L (30%).</li>
                          <li>LTCG: 12.5% after ₹1.25L annual exemption. 4% Cess + applicable surcharge on all.</li>
                          <li><strong className="text-[#00FF88]">V0.4 New:</strong> Tax-aware dual-source waterfall harvests the ₹1.25L LTCG exemption every year post-retirement.</li>
                        </ul>
                      </div>
                    </div>

                    {/* General Disclaimer */}
                    <div className="space-y-4 pt-6 border-t border-white/5">
                      <h3 className="font-black text-white uppercase tracking-widest text-[10px] text-red-400">⚠️ General Disclaimer & Compliance Consent</h3>
                      <div className="p-4 bg-red-500/5 rounded-xl border border-red-500/20 text-[10px] leading-relaxed text-white/60 space-y-2 font-mono">
                        <p><strong>1. Simulation Purposes Only:</strong> This application is a mathematical simulation tool designed purely for generic financial modeling and projection purposes based on user-supplied assumptions. It does not constitute financial, investment, legal, tax, or professional advice in any manner.</p>
                        <p><strong>2. Assumption Limits & Market Risk:</strong> All projections, return rates, and tax slab calculations (including Indian Income Tax Slabs FY 2025-26 and Capital Gains rates) are indicative. Past performance is no guarantee of future returns. All investments are strictly subject to market risks, including the potential loss of principal. The simulations presented herein are based solely on the data inputs provided by the user and do not reflect real-time market conditions, regulatory amendments, or individual financial circumstances.</p>
                        <p><strong>3. Limitation of Liability:</strong> Under no circumstances shall Earthscapes Digital, the application developers, owners, or affiliates be liable for any direct, indirect, consequential, or incidental losses, damages, or financial decisions arising from the use of, or reliance on, this simulation. Users are strongly advised to consult a SEBI-registered Independent Financial Advisor (IFA) or Registered Investment Adviser (RIA) before making any real-world investment decisions.</p>
                        <p><strong>4. Regulatory Notice:</strong> This tool does not constitute solicitation, promotion, or recommendation of any securities or investment product. The operator is not a registered financial advisor under SEBI regulations or any equivalent authority.</p>
                      </div>
                    </div>
                  </div>

                  {/* Checkbox */}
                  <div className="flex items-start gap-3 text-left py-2 select-none">
                    <input
                      type="checkbox"
                      id="agreeDisclaimer"
                      checked={disclaimerAgreed}
                      onChange={(e) => setDisclaimerAgreed(e.target.checked)}
                      className="w-4 h-4 rounded accent-accent mt-0.5 cursor-pointer bg-white/5 border border-white/10"
                    />
                    <label htmlFor="agreeDisclaimer" className="text-[10px] font-black uppercase tracking-wider text-white/70 cursor-pointer">
                      I have read and agree to the General Disclaimer & Compliance Consent terms. I understand this is a simulation tool only.
                    </label>
                  </div>
                </div>

                <button
                  disabled={!disclaimerAgreed}
                  onClick={() => { setShowYieldNotice(false); setShowOnboarding(true); }}
                  className={cn(
                    'w-full py-4 text-xs font-black rounded-2xl uppercase tracking-[0.2em] transition-all cursor-pointer border-0',
                    disclaimerAgreed
                      ? 'bg-accent text-background shadow-lg shadow-accent/20 active:scale-95 hover:brightness-110'
                      : 'bg-white/5 text-white/20 cursor-not-allowed'
                  )}
                >
                  Open FinPlan Suite V0.4
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Onboarding Modal */}
        {showOnboarding && (
          <div className="fixed inset-0 z-[300] bg-black/98 backdrop-blur-3xl flex items-center justify-center p-10 animate-in fade-in zoom-in-95 duration-700">
            <div className="max-w-4xl w-full glass-card border-accent/20 relative overflow-hidden flex flex-col max-h-[90vh]">
              <button onClick={() => setShowOnboarding(false)} className="absolute top-6 right-6 text-text-secondary hover:text-white z-10 p-2"><X className="w-5 h-5" /></button>
              <div className="flex-1 overflow-y-auto pt-4 px-12 pb-10 lg:pt-6 lg:px-16 no-scrollbar">
                <h2 className="text-2xl font-black mb-8 text-white tracking-widest text-center uppercase border-b border-white/10 pb-4 opacity-80">Enter your baseline data here</h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-accent tracking-[0.4em] border-l-4 border-accent pl-5">Timeline Metrics</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <InputGroup label="Current Age" value={inputs.currentAge} onChange={(v: number) => setInputs({ ...inputs, currentAge: v })} />
                      <InputGroup label="Retirement Age" value={inputs.retirementAge} onChange={(v: number) => setInputs({ ...inputs, retirementAge: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <InputGroup label="Annual Expense (₹ Lakhs)" value={parseFloat((inputs.monthlyExpenses * 12).toFixed(1))} step={0.5} onChange={(v: number) => setInputs({ ...inputs, monthlyExpenses: v / 12 })} />
                      <InputGroup label="Med. Insurance (₹ Lakhs)" value={inputs.medicalInsurance} step={0.1} onChange={(v: number) => setInputs({ ...inputs, medicalInsurance: v })} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <InputGroup label="Annual Income (₹ Lakhs)" value={inputs.annualSavings} onChange={(v: number) => setInputs({ ...inputs, annualSavings: v })} />
                      <InputGroup label="Income Growth % /yr" value={inputs.incomeGrowthRate} step={0.5} onChange={(v: number) => setInputs({ ...inputs, incomeGrowthRate: v })} />
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h4 className="text-[11px] font-black uppercase text-accent tracking-[0.4em] border-l-4 border-accent pl-5">Portfolio (Rs Lacs)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      <InputGroup label="Equity Value" value={inputs.domesticEquity} onChange={(v: number) => setInputs({ ...inputs, domesticEquity: v })} />
                      <InputGroup label="Fixed Deposits (FD)" value={inputs.fdAssets} onChange={(v: number) => setInputs({ ...inputs, fdAssets: v })} />
                      <InputGroup label="Debt Mutual Funds" value={inputs.debtMfAssets} onChange={(v: number) => setInputs({ ...inputs, debtMfAssets: v })} />
                      <InputGroup label="Bullion" value={inputs.goldAssets} onChange={(v: number) => setInputs({ ...inputs, goldAssets: v })} />
                      <InputGroup label="Alternatives" value={inputs.silverAssets} onChange={(v: number) => setInputs({ ...inputs, silverAssets: v })} />
                    </div>
                    <InputGroup label="Life Expectancy" value={inputs.endAge} onChange={(v: number) => setInputs({ ...inputs, endAge: v })} />
                  </div>
                </div>
                <button onClick={() => setShowOnboarding(false)} className="w-full py-4 bg-accent text-background text-base font-black rounded-2xl uppercase tracking-[0.3em] shadow-2xl transition-transform active:scale-95">Initialize Analysis</button>
              </div>
            </div>
          </div>
        )}

        {/* Rebalancing Targets Modal */}
        {showRebalanceModal && (
          <div className="fixed inset-0 z-[350] bg-black/95 backdrop-blur-2xl flex items-center justify-center p-6 animate-in fade-in duration-300">
            <div className="max-w-2xl w-full glass p-8 border-accent/20 relative overflow-hidden flex flex-col max-h-[90vh] shadow-3xl">
              <button
                onClick={() => setShowRebalanceModal(false)}
                className="absolute top-6 right-6 text-white/40 hover:text-white transition-colors p-2 cursor-pointer border-0 bg-transparent"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="text-center space-y-2 mb-6 border-b border-white/5 pb-4 shrink-0">
                <h2 className="text-xl font-black uppercase tracking-widest text-[#00F2FE]">Milestone Rebalancing Targets</h2>
                <p className="text-[10px] font-bold text-white/50 uppercase tracking-[0.2em]">Manual allocations – locked when Optimized Strategy is active</p>
              </div>

              <div className="flex justify-center gap-3 border-b border-white/5 pb-4 mb-6 shrink-0">
                {([1, 2, 3] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setActivePhaseTab(tab)}
                    className={cn(
                      'px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 cursor-pointer border-0',
                      activePhaseTab === tab ? 'bg-accent text-background shadow-lg shadow-accent/20' : 'bg-white/5 text-white/60 hover:text-white'
                    )}
                  >
                    {tab === 1 && `🛡️ Phase 1 (Retire)`}
                    {tab === 2 && `⚖️ Phase 2 (Age 70)`}
                    {tab === 3 && `🚀 Phase 3 (Age 80)`}
                  </button>
                ))}
              </div>

              <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-6 min-h-0">
                {activePhaseTab === 1 && (
                  <PhaseModalContent
                    title="Phase 1: Retirement Transition" age={inputs.retirementAge}
                    alloc={inputs.phase1Alloc}
                    onChange={(newAlloc: any) => setInputs({ ...inputs, phase1Alloc: newAlloc })}
                    triggerDesc={`Triggers at Age ${inputs.retirementAge} if Equity > 50%.`}
                    taxDesc="Sells excess equities to reach targets, triggering 12.5% LTCG on liquidated amount."
                  />
                )}
                {activePhaseTab === 2 && (
                  <PhaseModalContent
                    title="Phase 2: Mid-Retirement Adjustment" age={70}
                    alloc={inputs.phase2Alloc}
                    onChange={(newAlloc: any) => setInputs({ ...inputs, phase2Alloc: newAlloc })}
                    triggerDesc="Triggers at Age 70 if Equity > 30%."
                    taxDesc="Sells excess equities to reach targets, triggering 12.5% LTCG on liquidated amount."
                  />
                )}
                {activePhaseTab === 3 && (
                  <PhaseModalContent
                    title="Phase 3: Late Retirement Preservation" age={80}
                    alloc={inputs.phase3Alloc}
                    onChange={(newAlloc: any) => setInputs({ ...inputs, phase3Alloc: newAlloc })}
                    triggerDesc="Triggers at Age 80 if Equity > 10%."
                    taxDesc="Sells excess equities to reach targets, triggering 12.5% LTCG on liquidated amount."
                  />
                )}
              </div>

              <button
                onClick={() => setShowRebalanceModal(false)}
                className="w-full py-3.5 bg-accent text-background text-xs font-black rounded-xl uppercase tracking-widest shadow-2xl transition-transform active:scale-95 shrink-0 mt-6 cursor-pointer border-0"
              >
                Save & Apply Strategy
              </button>
            </div>
          </div>
        )}

        {/* ── GLOBAL HEADER ── */}
        <header className="h-[50px] border-b border-white/5 bg-[#030508] flex items-center justify-between px-8 z-50 shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center border border-white/10 shadow-lg shadow-accent/10">
              <Activity className="text-background w-4 h-4" />
            </div>
            <h1 className="text-sm font-black tracking-tighter uppercase whitespace-nowrap">
              FinPlan <span className="text-accent underline decoration-accent/20">Suite V2.0</span>
            </h1>
            {strategyMode === 'optimized' && (
              <span className="text-[9px] font-black uppercase tracking-widest text-[#00FF88] bg-[#00FF88]/10 border border-[#00FF88]/30 px-2 py-0.5 rounded-full flex items-center gap-1 animate-pulse">
                <Zap className="w-2.5 h-2.5" /> Optimized
              </span>
            )}
          </div>

          <div className="flex items-center gap-6">
            <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
              <button onClick={() => setZoomLevel(prev => Math.max(0.7, prev - 0.05))} className="p-1.5 hover:bg-white/10 rounded-md transition-colors"><Minus className="w-3.5 h-3.5" /></button>
              <span className="text-[11px] font-black w-10 text-center opacity-40 font-mono">{(zoomLevel * 100).toFixed(0)}%</span>
              <button onClick={() => setZoomLevel(prev => Math.min(1.3, prev + 0.05))} className="p-1.5 hover:bg-white/10 rounded-md transition-colors"><Plus className="w-3.5 h-3.5" /></button>
            </div>
            <button onClick={handleExportPDF} className="bg-accent text-background px-6 py-2 rounded-lg text-xs font-black uppercase tracking-widest shadow-xl shadow-accent/20 transition-transform active:scale-95 flex items-center gap-2">
              <Printer className="w-3.5 h-3.5" /> PRINT REPORT
            </button>
          </div>
        </header>

        {/* ── MAIN WORKSPACE ── */}
        <div className="flex flex-1 overflow-hidden" style={{ zoom: zoomLevel }}>

          {/* ── LEFT SIDEBAR ── */}
          <aside className="w-[380px] border-r border-white/5 bg-[#030508] flex flex-col h-full overflow-y-auto custom-scrollbar shrink-0 z-40 p-6 space-y-4">
            <div className="flex items-center gap-2 text-accent font-black tracking-widest uppercase text-[10px] border-b border-white/5 pb-3">
              <Sliders className="w-4 h-4" /> Modeling Console
            </div>

            {/* Panel 0: Macro Regimes & Scenario Controls */}
            <CollapsiblePanel title="🌐 Macro Stories & ALTS V2.0" panelKey="macro" activePanel={activePanel} toggle={togglePanel} icon={Activity}>
              <div className="space-y-4 text-xs">
                <div className="space-y-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block mb-1">Select Country Story</span>
                  <div className="flex gap-1.5 bg-white/[0.03] p-1 border border-white/5 rounded-xl">
                    {(['india', 'china', 'japan'] as const).map(reg => (
                      <button
                        key={reg}
                        type="button"
                        onClick={() => setInputs({ ...inputs, macroRegime: reg })}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border cursor-pointer text-center',
                          inputs.macroRegime === reg
                            ? 'bg-accent/15 border-accent/40 text-accent shadow-md'
                            : 'bg-transparent border-transparent text-white/40 hover:text-white'
                        )}
                      >
                        {reg === 'india' && '🇮🇳 India'}
                        {reg === 'china' && '🇨🇳 China'}
                        {reg === 'japan' && '🇯🇵 Japan'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1">
                  <span className="text-[8px] font-black uppercase tracking-widest text-white/40 block mb-1">Simulation Mode</span>
                  <div className="flex gap-1.5 bg-white/[0.03] p-1 border border-white/5 rounded-xl">
                    {(['forecast', 'historical'] as const).map(mode => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setInputs({ ...inputs, runMode: mode })}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border cursor-pointer text-center',
                          inputs.runMode === mode
                            ? 'bg-accent/15 border-accent/40 text-accent shadow-md'
                            : 'bg-transparent border-transparent text-white/40 hover:text-white'
                        )}
                      >
                        {mode === 'forecast' && '🔮 Forecast'}
                        {mode === 'historical' && '⏳ Historical'}
                      </button>
                    ))}
                  </div>
                </div>

                {inputs.runMode === 'historical' && (
                  <div className="space-y-2 p-3 bg-white/[0.01] rounded-xl border border-white/5 animate-in fade-in duration-200">
                    <HorizontalInputLarge
                      label="Historical Start"
                      min={1980}
                      max={2000}
                      step={1}
                      value={inputs.historicalStartYear ?? 1986}
                      onChange={(v: number) => setInputs({ ...inputs, historicalStartYear: v })}
                    />
                    <div className="text-[8.5px] font-bold text-accent/70 font-mono text-center uppercase tracking-wide">
                      ⏳ Rebased to 1980 Index Inceptions
                    </div>
                  </div>
                )}

                <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/80 block">3-Bucket ALTS Engine</span>
                    <span className="text-[8px] font-bold text-white/45 uppercase tracking-wider block">Dynamic Cash Refilling</span>
                  </div>
                  <ToggleSwitch checked={!!inputs.altsEnabled} onChange={(v) => setInputs({ ...inputs, altsEnabled: v })} />
                </div>
              </div>
            </CollapsiblePanel>

            {/* Panel 1: Demographics */}
            <CollapsiblePanel title="👤 Demographics & Horizon" panelKey="demographics" activePanel={activePanel} toggle={togglePanel} icon={Clock}>
              <div className="space-y-1 text-xs">
                <HorizontalInputLarge label="Current Age" value={inputs.currentAge} onChange={(v: number) => setInputs({ ...inputs, currentAge: v })} />
                <HorizontalInputLarge label="Retirement Age" value={inputs.retirementAge} onChange={(v: number) => setInputs({ ...inputs, retirementAge: v })} />
                <HorizontalInputLarge label="Life Expectancy" value={inputs.endAge} onChange={(v: number) => setInputs({ ...inputs, endAge: v })} />
              </div>
            </CollapsiblePanel>

            {/* Panel 2: Assets */}
            <CollapsiblePanel title="💰 Initial Capital Assets" panelKey="assets" activePanel={activePanel} toggle={togglePanel} icon={DollarSign}>
              <div className="space-y-1 text-xs">
                <HorizontalInputLarge label="Domestic Equity" value={inputs.domesticEquity} onChange={(v: number) => setInputs({ ...inputs, domesticEquity: v })} />
                <HorizontalInputLarge label="Intl Equity" value={inputs.intlEquity} onChange={(v: number) => setInputs({ ...inputs, intlEquity: v })} />
                <HorizontalInputLarge label="Fixed Deposits (FD)" value={inputs.fdAssets} onChange={(v: number) => setInputs({ ...inputs, fdAssets: v })} />
                <HorizontalInputLarge label="Debt Mutual Funds" value={inputs.debtMfAssets} onChange={(v: number) => setInputs({ ...inputs, debtMfAssets: v })} />
                <HorizontalInputLarge label="Gold & Metals" value={inputs.goldAssets} onChange={(v: number) => setInputs({ ...inputs, goldAssets: v })} />
                <HorizontalInputLarge label="Alternatives" value={inputs.silverAssets} onChange={(v: number) => setInputs({ ...inputs, silverAssets: v })} />

                <div className="mt-4 space-y-2 border-t border-white/5 pt-3">
                  <span className="text-[8px] font-black tracking-wider opacity-40 uppercase">Initial Distribution</span>
                  <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-white/5 shadow-inner p-0.5">
                    <div style={{ width: `${currentEqPct}%`, backgroundColor: HEX.accent }} className="transition-all duration-500" />
                    <div style={{ width: `${currentDbPct}%`, backgroundColor: HEX.debt }} className="transition-all duration-500" />
                    <div style={{ width: `${currentOtPct}%`, backgroundColor: HEX.alt }} className="transition-all duration-500" />
                  </div>
                  <div className="flex justify-between text-[8px] font-black uppercase opacity-45 px-1 font-mono">
                    <span style={{ color: HEX.accent }}>Eq: {currentEqPct.toFixed(0)}%</span>
                    <span style={{ color: HEX.debt }}>Db: {currentDbPct.toFixed(0)}%</span>
                    <span style={{ color: HEX.alt }}>Alts: {currentOtPct.toFixed(0)}%</span>
                  </div>
                </div>
              </div>
            </CollapsiblePanel>

            {/* Panel 3: Cashflow */}
            <CollapsiblePanel title="📈 Income & Expenses" panelKey="cashflow" activePanel={activePanel} toggle={togglePanel} icon={TrendingUp}>
              <div className="space-y-1 text-xs">
                <HorizontalInputLarge label="Annual Income" value={inputs.annualSavings} onChange={(v: number) => setInputs({ ...inputs, annualSavings: v })} />
                <HorizontalInputLarge label="Income Growth % /yr" value={inputs.incomeGrowthRate} step={0.5} onChange={(v: number) => setInputs({ ...inputs, incomeGrowthRate: v })} />
                <HorizontalInputLarge label="Annual Expense" value={parseFloat((inputs.monthlyExpenses * 12).toFixed(1))} step={0.5} onChange={(v: number) => setInputs({ ...inputs, monthlyExpenses: v / 12 })} />
                <HorizontalInputLarge label="Medical Insurance" value={inputs.medicalInsurance} step={0.1} onChange={(v: number) => setInputs({ ...inputs, medicalInsurance: v })} />
              </div>
            </CollapsiblePanel>

            {/* Panel 4: Rebalancing + V0.4 Strategy Optimizer */}
            <CollapsiblePanel
              title="🔄 Age Rebalancing"
              panelKey="rebalance"
              activePanel={activePanel}
              toggle={togglePanel}
              icon={Sliders}
              toggleSwitch={<ToggleSwitch checked={enableRebalance} onChange={setEnableRebalance} />}
            >
              {enableRebalance ? (
                <div className="space-y-4 mt-1 animate-in fade-in duration-200">

                  {/* V0.4: Strategy Toggle */}
                  <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5 space-y-3">
                    <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Strategy Mode</span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setStrategyMode('manual')}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border cursor-pointer',
                          strategyMode === 'manual'
                            ? 'bg-white/10 border-white/20 text-white'
                            : 'bg-transparent border-white/5 text-white/30 hover:border-white/10 hover:text-white/50'
                        )}
                      >
                        Manual
                      </button>
                      <button
                        onClick={strategyMode === 'optimized' ? undefined : handleOptimize}
                        disabled={isOptimizing}
                        className={cn(
                          'flex-1 py-2 rounded-lg text-[9px] font-black uppercase tracking-widest transition-all border cursor-pointer flex items-center justify-center gap-1',
                          strategyMode === 'optimized'
                            ? 'bg-[#00FF88]/15 border-[#00FF88]/40 text-[#00FF88]'
                            : 'bg-transparent border-white/5 text-white/30 hover:border-[#00FF88]/20 hover:text-[#00FF88]/60'
                        )}
                      >
                        {isOptimizing ? (
                          <span className="animate-spin">⚙</span>
                        ) : (
                          <><Zap className="w-2.5 h-2.5" /> Optimized</>
                        )}
                      </button>
                    </div>

                    {/* Optimized results badge */}
                    {strategyMode === 'optimized' && optimizedResult && (
                      <div className="p-2.5 bg-[#00FF88]/5 rounded-lg border border-[#00FF88]/20 space-y-1.5 text-[9px]">
                        <div className="text-[#00FF88] font-black uppercase tracking-widest flex items-center gap-1">
                          <Zap className="w-2.5 h-2.5" /> Optimal Targets Found
                        </div>
                        <div className="grid grid-cols-3 gap-1 font-mono text-[8px] text-white/50">
                          <div>P1: {optimizedResult.phase1Alloc.equity}%/{optimizedResult.phase1Alloc.debt}%</div>
                          <div>P2: {optimizedResult.phase2Alloc.equity}%/{optimizedResult.phase2Alloc.debt}%</div>
                          <div>P3: {optimizedResult.phase3Alloc.equity}%/{optimizedResult.phase3Alloc.debt}%</div>
                        </div>
                        <div className="text-[#00FF88]/70 font-mono">
                          Solvency: Age {optimizedResult.solvencyAge} {optimizedResult.improved ? '↑ improved' : '(same as manual)'} | Glide: {optimizedResult.rebalanceYears === 1 ? '1-Yr (Lump Sum)' : `${optimizedResult.rebalanceYears}-Yr Glide`}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Staged Glide Path Window length slider */}
                  <div className="p-3 bg-white/[0.02] rounded-xl border border-white/5 space-y-2">
                    <HorizontalInputLarge
                      label={strategyMode === 'optimized' ? "Rebalance Glide (Optimized)" : "Rebalance Glide (Manual)"}
                      min={1}
                      max={7}
                      step={1}
                      value={effectiveInputs.rebalanceYears}
                      disabled={strategyMode === 'optimized'}
                      onChange={(v: number) => setInputs({ ...inputs, rebalanceYears: v })}
                    />
                    <div className="flex justify-between text-[8px] font-bold uppercase tracking-widest text-white/35 font-mono px-0.5">
                      <span>{effectiveInputs.rebalanceYears === 1 ? '1-Yr (Lump Sum)' : `${effectiveInputs.rebalanceYears}-Yr Glide Transition`}</span>
                      {strategyMode === 'optimized' && <span className="text-[#00FF88]">⚡ Optimized Glide Window</span>}
                    </div>
                  </div>


                  <button
                    onClick={() => setShowRebalanceModal(true)}
                    className="w-full py-2.5 bg-accent/10 hover:bg-accent/20 border border-accent/20 text-accent rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 cursor-pointer group"
                  >
                    <Sliders className="w-3.5 h-3.5 group-hover:rotate-45 transition-transform" />
                    Configure Manual Targets
                  </button>
                </div>
              ) : (
                <div className="text-[10px] uppercase font-black text-center text-white/20 mt-2 border border-dashed border-white/5 p-4 rounded-xl">Rebalancing Disabled</div>
              )}
            </CollapsiblePanel>

            {/* Panel 5: Crisis Stress – INDEPENDENT of rebalance */}
            <CollapsiblePanel
              title="⛈️ Crisis Stress Simulator"
              panelKey="crisis"
              activePanel={activePanel}
              toggle={togglePanel}
              icon={ShieldAlert}
              toggleSwitch={<ToggleSwitch checked={enableStress} onChange={setEnableStress} />}
            >
              {enableStress ? (
                <div className="space-y-4 mt-2 animate-in fade-in zoom-in-95 duration-200 text-xs">
                  <HorizontalInputLarge label="Market Performance %" value={stressParams.mktReturn} min={-10} max={25} step={0.5} onChange={(v: number) => setStressParams({ ...stressParams, mktReturn: v })} />
                  <HorizontalInputLarge label="Shock Frequency (Yrs)" value={stressParams.illFreq} min={1} max={30} onChange={(v: number) => setStressParams({ ...stressParams, illFreq: v })} />
                  <HorizontalInputLarge label="Emergency Draw (Lakhs)" value={stressParams.illAmt} min={1} max={1000} onChange={(v: number) => setStressParams({ ...stressParams, illAmt: v })} />
                </div>
              ) : (
                <div className="text-[10px] uppercase font-black text-center text-white/20 mt-2 border border-dashed border-white/5 p-4 rounded-xl">Stress Test Disabled</div>
              )}
            </CollapsiblePanel>

            {/* Copyright */}
            <div className="pt-4 border-t border-white/5 text-[9px] font-black uppercase tracking-[0.2em] text-white/30 space-y-1 text-center select-none shrink-0">
              <div>© Earthscapes Digital 2026</div>
              <div className="text-[8px] opacity-70">Free for personal use only</div>
            </div>
          </aside>

          {/* ── RIGHT PANEL ── */}
          <main className="flex-1 overflow-y-auto bg-background p-8 no-scrollbar relative min-w-0">
            <div className="max-w-[1700px] w-full mx-auto space-y-6 h-full flex flex-col">

              {/* KPI Cards */}
              <div className="grid grid-cols-12 gap-6 shrink-0">
                <div className={cn(
                  'col-span-12 lg:col-span-5 border rounded-2xl p-6 flex items-center justify-between shadow-2xl backdrop-blur-md',
                  isSolventAtEnd ? 'border-positive/20 bg-positive/5 text-positive' : 'border-negative/20 bg-negative/5 text-negative'
                )}>
                  <div className="space-y-1">
                    <span className="text-[10px] font-black uppercase opacity-60 tracking-wider">Asset Longevity</span>
                    <h2 className="text-3xl font-black tracking-tighter">
                      {isSolventAtEnd ? `SECURED (${inputs.endAge}+ YRS)` : `LIQUIDATED AGE ${simulationData.outAge}`}
                    </h2>
                    {strategyMode === 'optimized' && optimizedResult && (
                      <span className="text-[9px] font-black text-[#00FF88] flex items-center gap-1 mt-1">
                        <Zap className="w-2.5 h-2.5" /> Optimized Strategy Active
                      </span>
                    )}
                  </div>
                  <Activity className="w-10 h-10 opacity-30 animate-pulse" />
                </div>

                <div className="col-span-6 lg:col-span-3 border border-white/5 bg-white/[0.01] rounded-2xl p-6 flex flex-col justify-center">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#8E9AAF]">Terminal Burn Rate</span>
                  <span className="text-xl font-black mt-2">₹ {parseFloat((simulationData.records[simulationData.records.length - 1]?.Expense / 1e5).toFixed(1))} L / Yr</span>
                </div>

                <div className="col-span-6 lg:col-span-2 border border-white/5 bg-white/[0.01] rounded-2xl p-6 flex flex-col justify-center">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#8E9AAF]">Initial Capital</span>
                  <span className="text-xl font-black mt-2">₹ {totalCurrent.toFixed(1)} L</span>
                </div>

                {/* V0.4: Tax drag KPI */}
                <div className="col-span-12 lg:col-span-2 border border-[#FF6B35]/20 bg-[#FF6B35]/5 rounded-2xl p-6 flex flex-col justify-center">
                  <span className="text-[9px] font-black uppercase tracking-wider text-[#FF6B35]/80">Post-Ret Tax Drag</span>
                  <span className="text-xl font-black mt-2 text-[#FF6B35]">{formatToCrores(totalTaxDrag)}</span>
                </div>
              </div>

              {/* Main chart/audit area */}
              <div className="flex-1 min-h-0 glass p-8 shadow-3xl border-white/5 flex flex-col">

                {/* Tab switcher – 3 tabs in V0.4 */}
                <div className="flex items-center justify-between border-b border-white/5 pb-4 mb-6 shrink-0">
                  <span className="text-[12px] font-black uppercase tracking-[0.3em] text-accent/80">
                    {viewMode === 'rebalanceReport' ? 'Milestone Staged Rebalancing Strategy' : (viewMode === 'decumulation' ? 'Post-Retirement Decumulation Flows' : (viewMode === 'buckets' ? 'Dynamic 3-Bucket ALTS Segments' : 'Asset Lifespan Trace'))}
                  </span>

                  <div className="flex items-center gap-1 bg-white/5 rounded-lg p-0.5 border border-white/10">
                    <button
                      onClick={() => setViewMode('chart')}
                      className={cn('px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2',
                        viewMode === 'chart' ? 'bg-accent text-background shadow-lg' : 'text-white/40 hover:text-white')}
                    >
                      <BarChart3 className="w-3.5 h-3.5" /> Longevity Path
                    </button>
                    {inputs.altsEnabled && (
                      <button
                        onClick={() => setViewMode('buckets')}
                        className={cn('px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2',
                          viewMode === 'buckets' ? 'bg-[#7367F0] text-white shadow-lg' : 'text-white/40 hover:text-white')}
                      >
                        <Activity className="w-3.5 h-3.5" /> Buckets
                      </button>
                    )}
                    <button
                      onClick={() => setViewMode('decumulation')}
                      className={cn('px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2',
                        viewMode === 'decumulation' ? 'bg-[#FF6B35] text-white shadow-lg' : 'text-white/40 hover:text-white')}
                    >
                      <TrendingUp className="w-3.5 h-3.5" /> Decumulation
                    </button>
                    <button
                      onClick={() => setViewMode('audit')}
                      className={cn('px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2',
                        viewMode === 'audit' ? 'bg-accent text-background shadow-lg' : 'text-white/40 hover:text-white')}
                    >
                      <List className="w-3.5 h-3.5" /> Ledger
                    </button>
                    <button
                      onClick={() => setViewMode('rebalanceReport')}
                      className={cn('px-4 py-1.5 rounded-md text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-2',
                        viewMode === 'rebalanceReport' ? 'bg-[#00FF88] text-black shadow-lg font-black' : 'text-white/40 hover:text-white')}
                    >
                      <Zap className="w-3.5 h-3.5" /> Rebalancing Report
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-h-0">

                  {/* ─ TAB 1: Capital Longevity Path Chart ─ */}
                  {viewMode === 'chart' && (
                    <ResponsiveContainer width="100%" height="95%">
                      <ComposedChart data={simulationData.records} margin={{ top: 10, right: 30, left: 30, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="Age" axisLine={false} tickLine={false} tick={{ fill: HEX.textDim, fontSize: 12 }}>
                          <Label value="Age" offset={-10} position="insideBottom" fill={HEX.accent} fontSize={11} fontWeight={900} />
                        </XAxis>
                        <YAxis domain={[0, 'auto']} axisLine={false} tickLine={false} tick={{ fill: HEX.textDim, fontSize: 12 }} tickFormatter={formatAxisCrores}>
                          <Label value="Crores" angle={-90} position="insideLeft" fill={HEX.accent} fontSize={11} fontWeight={900} offset={-5} />
                        </YAxis>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0F1219', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px' }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(val: any, name: any) => {
                            if (name === 'Balance') return [formatToCrores(val), 'Portfolio Balance'];
                            if (name === 'Expense') return [formatToCrores(val), 'Expenses Burn'];
                            if (name === 'Shock') return [formatToCrores(val), 'Crisis Shock'];
                            return [formatToCrores(val), name];
                          }}
                        />
                        <Area type="monotone" dataKey="Balance" stroke={HEX.accent} strokeWidth={4} fillOpacity={0.06} fill={HEX.accent} />
                        <Area type="monotone" dataKey="Expense" stroke={HEX.expense} strokeWidth={2} strokeDasharray="5 5" fill="none" />
                        {enableStress && <Bar dataKey="Shock" fill={HEX.expense} radius={[4, 4, 0, 0]} barSize={10} />}
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}

                  {/* ─ TAB 1B: V2.0 Buckets Composition Chart ─ */}
                  {viewMode === 'buckets' && inputs.altsEnabled && (
                    <ResponsiveContainer width="100%" height="95%">
                      <AreaChart data={simulationData.records} margin={{ top: 10, right: 30, left: 30, bottom: 20 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                        <XAxis dataKey="Age" axisLine={false} tickLine={false} tick={{ fill: HEX.textDim, fontSize: 12 }}>
                          <Label value="Age" offset={-10} position="insideBottom" fill={HEX.accent} fontSize={11} fontWeight={900} />
                        </XAxis>
                        <YAxis domain={[0, 'auto']} axisLine={false} tickLine={false} tick={{ fill: HEX.textDim, fontSize: 12 }} tickFormatter={formatAxisCrores}>
                          <Label value="Crores" angle={-90} position="insideLeft" fill={HEX.accent} fontSize={11} fontWeight={900} offset={-5} />
                        </YAxis>
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0F1219', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px' }}
                          itemStyle={{ color: '#fff' }}
                          formatter={(val: any, name: any) => {
                            const names: Record<string, string> = {
                              Bucket1: 'Bucket 1 (Liquid LDI Debt)',
                              Bucket2: 'Bucket 2 (Transition Core 30/70)',
                              Bucket3: 'Bucket 3 (High-Octane Equity/Gold)',
                            };
                            return [formatToCrores(val), names[name] ?? name];
                          }}
                        />
                        <Area type="monotone" dataKey="Bucket1" stackId="1" stroke="#7367F0" strokeWidth={2} fill="#7367F0" fillOpacity={0.4} />
                        <Area type="monotone" dataKey="Bucket2" stackId="1" stroke="#32CC6D" strokeWidth={2} fill="#32CC6D" fillOpacity={0.4} />
                        <Area type="monotone" dataKey="Bucket3" stackId="1" stroke="#00C8FF" strokeWidth={2} fill="#00C8FF" fillOpacity={0.4} />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}

                  {/* ─ TAB 2: V0.4 Decumulation Flows Chart ─ */}
                  {viewMode === 'decumulation' && (
                    decumRecords.length > 0 ? (
                      <ResponsiveContainer width="100%" height="95%">
                        <ComposedChart data={decumRecords} margin={{ top: 10, right: 30, left: 30, bottom: 20 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.06)" />
                          <XAxis dataKey="Age" axisLine={false} tickLine={false} tick={{ fill: HEX.textDim, fontSize: 12 }}>
                            <Label value="Age" offset={-10} position="insideBottom" fill={HEX.accent} fontSize={11} fontWeight={900} />
                          </XAxis>
                          <YAxis axisLine={false} tickLine={false} tick={{ fill: HEX.textDim, fontSize: 12 }} tickFormatter={(v) => (v / 1e5).toFixed(1)}>
                            <Label value="₹ Lakhs" angle={-90} position="insideLeft" fill={HEX.accent} fontSize={11} fontWeight={900} offset={-5} />
                          </YAxis>
                          <Tooltip
                            contentStyle={{ backgroundColor: '#0F1219', border: '1px solid rgba(255,255,255,0.15)', borderRadius: '12px' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(val: any, name: any) => {
                              const labels: Record<string, string> = {
                                EqSourced: 'Equity Drawn (incl. LTCG harvest)',
                                DbSourced: 'Debt Drawn',
                                AltSourced: 'Alts Drawn',
                                LTCGTaxPaid: 'LTCG Tax Paid',
                                SlabTaxPaid: 'Slab Tax Paid',
                              };
                              return [formatLakhs(val), labels[name] ?? name];
                            }}
                          />
                          {/* Stacked sourcing areas */}
                          <Area type="monotone" dataKey="EqSourced"  stackId="src" stroke={HEX.eqSource}  strokeWidth={1.5} fill={HEX.eqSource}  fillOpacity={0.25} />
                          <Area type="monotone" dataKey="DbSourced"  stackId="src" stroke={HEX.dbSource}  strokeWidth={1.5} fill={HEX.dbSource}  fillOpacity={0.25} />
                          <Area type="monotone" dataKey="AltSourced" stackId="src" stroke={HEX.altSource} strokeWidth={1.5} fill={HEX.altSource} fillOpacity={0.25} />
                          {/* Tax bars overlaid */}
                          <Bar dataKey="LTCGTaxPaid" fill={HEX.taxBar}   radius={[3, 3, 0, 0]} barSize={8} />
                          <Bar dataKey="SlabTaxPaid" fill="#CC2200" radius={[3, 3, 0, 0]} barSize={8} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-white/20 font-black text-sm uppercase tracking-widest">
                        No post-retirement data available
                      </div>
                    )
                  )}

                  {/* ─ TAB 3: V0.4 Expanded Ledger ─ */}
                  {viewMode === 'audit' && (
                    <div className="overflow-auto h-full custom-scrollbar">
                      <table className="w-full text-left border-collapse text-[11px]">
                        <thead className="uppercase font-black tracking-[0.25em] sticky top-0 bg-[#0F1219] z-10">
                          {/* Group header row */}
                          <tr className="text-[8px] border-b border-white/3">
                            <th colSpan={inputs.altsEnabled ? 11 : 8} className="px-3 py-1 text-white/20 border-r border-white/5">Portfolio & Cashflow</th>
                            <th colSpan={6} className="px-3 py-1 text-[#FF6B35]/60">▸ Expense Funds (post-retirement sourcing)</th>
                          </tr>
                          {/* Column header row */}
                          <tr className="border-b border-white/5">
                            <th className="px-3 py-3 text-white/40">Age (Yr)</th>
                            <th className="px-3 py-3 text-accent">Net Portfolio</th>
                            <th className="px-3 py-3 text-[#00F2FE]">Equity</th>
                            <th className="px-3 py-3 text-[#7367F0]">Debt</th>
                            <th className="px-3 py-3 text-[#32CC6D]">Other</th>
                            {inputs.altsEnabled && (
                              <>
                                <th className="px-3 py-3 text-[#7367F0] font-mono text-[9px]">Bucket 1 (LDI)</th>
                                <th className="px-3 py-3 text-[#32CC6D] font-mono text-[9px]">Bucket 2 (Trans)</th>
                                <th className="px-3 py-3 text-[#00C8FF] font-mono text-[9px]">Bucket 3 (Octane)</th>
                              </>
                            )}
                            <th className="px-3 py-3 text-[#00FF88]">Income</th>
                            <th className="px-3 py-3 text-white/40">Expenses</th>
                            <th className="px-3 py-3 text-negative border-r border-white/5">Crisis</th>
                            {/* Expense Funds group */}
                            <th className="px-3 py-3 text-white/30 text-[9px]">rEq Used</th>
                            <th className="px-3 py-3 text-[#00C8FF]">Eq Sourced</th>
                            <th className="px-3 py-3 text-[#9B59B6]">Db Sourced</th>
                            <th className="px-3 py-3 text-[#32CC6D]">Alt Sourced</th>
                            <th className="px-3 py-3 text-[#00FF88] border-l border-white/5">LTCG Exempt</th>
                            <th className="px-3 py-3 text-[#FF6B35]">LTCG Tax</th>
                            <th className="px-3 py-3 text-[#FF4D4D]">Slab Tax</th>
                          </tr>
                        </thead>
                        <tbody className="font-bold">
                          {simulationData.records.map((row) => {
                            const isPost = row.Age >= inputs.retirementAge;
                            return (
                              <tr key={row.Age} className={cn('border-b border-white/5 hover:bg-white/[0.02] transition-colors', isPost && 'bg-white/[0.005]')}>
                                {/* Age */}
                                <td className="px-3 py-2.5 font-black whitespace-nowrap">
                                  {row.Age} <span className="opacity-20 ml-1 font-normal text-[10px]">({row.Year})</span>
                                  {isPost && <span className="ml-1 text-[8px] text-accent/40">RET</span>}
                                </td>
                                {/* Net Portfolio */}
                                <td className="px-3 py-2.5 font-black text-accent font-mono">{formatToCrores(row.Balance)}</td>
                                {/* Asset buckets */}
                                <td className="px-3 py-2.5 text-[#00F2FE]/80 font-mono font-normal">{formatToCrores(row.Equity)}</td>
                                <td className="px-3 py-2.5 text-[#7367F0]/80 font-mono font-normal cursor-help" title={`Fixed Deposits (FD): ${formatToCrores(row.DebtFD)}\nDebt Mutual Funds: ${formatToCrores(row.DebtMF)}`}>{formatToCrores(row.Debt)}</td>
                                <td className="px-3 py-2.5 text-[#32CC6D]/80 font-mono font-normal">{formatToCrores(row.Other)}</td>
                                {inputs.altsEnabled && (
                                  <>
                                    <td className="px-3 py-2.5 text-[#7367F0]/80 font-mono font-normal">{formatToCrores(row.Bucket1 ?? 0)}</td>
                                    <td className="px-3 py-2.5 text-[#32CC6D]/80 font-mono font-normal">{formatToCrores(row.Bucket2 ?? 0)}</td>
                                    <td className="px-3 py-2.5 text-[#00C8FF]/80 font-mono font-normal">{formatToCrores(row.Bucket3 ?? 0)}</td>
                                  </>
                                )}
                                {/* Income (pre-retirement only) */}
                                <td className="px-3 py-2.5 text-[#00FF88]/80 font-mono font-normal">
                                  {!isPost && row.IncomeAdded > 0 ? formatLakhs(row.IncomeAdded) : <span className="opacity-20">–</span>}
                                </td>
                                {/* Expenses & Crisis */}
                                <td className="px-3 py-2.5 opacity-50 font-mono font-normal">{formatToCrores(row.Expense)}</td>
                                <td className="px-3 py-2.5 text-negative font-black font-mono border-r border-white/5">{row.Shock > 0 ? formatToCrores(row.Shock) : <span className="opacity-20">–</span>}</td>
                                {/* V2.0 Audit Columns: Equity return used */}
                                <td className="px-3 py-2.5 text-white/40 font-mono font-normal text-[10px]">{(row.rEqUsed !== undefined ? (row.rEqUsed * 100).toFixed(1) : 12.0)}%</td>
                                {/* Expense Funds group */}
                                <td className="px-3 py-2.5 text-[#00C8FF]/80 font-mono font-normal">{isPost ? formatLakhs(row.EqSourced) : <span className="opacity-20">–</span>}</td>
                                <td className="px-3 py-2.5 text-[#9B59B6]/80 font-mono font-normal">{isPost ? formatLakhs(row.DbSourced) : <span className="opacity-20">–</span>}</td>
                                <td className="px-3 py-2.5 text-[#32CC6D]/80 font-mono font-normal">{isPost ? formatLakhs(row.AltSourced) : <span className="opacity-20">–</span>}</td>
                                <td className="px-3 py-2.5 text-[#00FF88]/80 font-mono font-normal border-l border-white/5">{isPost ? formatLakhs(row.LTCGExempted) : <span className="opacity-20">–</span>}</td>
                                <td className="px-3 py-2.5 font-mono font-normal">{row.LTCGTaxPaid > 0 ? <span className="text-[#FF6B35]">{formatLakhs(row.LTCGTaxPaid)}</span> : <span className="opacity-20">–</span>}</td>
                                <td className="px-3 py-2.5 font-mono font-normal">{row.SlabTaxPaid > 0 ? <span className="text-[#FF4D4D]/80">{formatLakhs(row.SlabTaxPaid)}</span> : <span className="opacity-20">–</span>}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {/* ─ TAB 4: V0.4 Rebalancing Strategy & Tax Report ─ */}
                  {viewMode === 'rebalanceReport' && (
                    <div className="overflow-auto h-full custom-scrollbar space-y-6 max-w-4xl mx-auto py-4">
                      <div className="p-8 bg-white/[0.02] border border-white/10 rounded-2xl space-y-6">
                        <div className="text-base font-black uppercase tracking-widest text-[#00FF88] border-b border-white/5 pb-3 flex items-center gap-2">
                          <Zap className="w-5 h-5 animate-pulse text-[#00FF88]" /> Milestone Rebalancing Strategy &amp; Tax Report
                        </div>
                        
                        <div className="space-y-4">
                          <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3 text-xs leading-relaxed text-white/70">
                            <span className="text-[10px] font-black uppercase tracking-widest text-[#00FF88] block">💡 Net Wealth Optimization vs. Absolute Tax Minimization</span>
                            <p>
                              Milestone rebalancing shifts capital from volatile Equities into stable Debt assets as you age to preserve capital. However, executing this transfer in a <strong>single lump-sum year</strong> realizes huge capital gains at once, triggering high slab and LTCG tax rates on the excess gains.
                            </p>
                            <p>
                              Spreading this transition over a <strong>staged glide path (up to 7 years)</strong> allows your portfolio to harvest the annual ₹1.25L tax-free LTCG exemption multiple times, shielding assets from immediate taxes.
                            </p>
                            <p className="border-t border-white/5 pt-3">
                              <strong>Why is the absolute tax outgo sometimes higher for the Staged Glide Path?</strong><br/>
                              In many scenarios, keeping a larger portion of your assets compounding in high-growth Equities (12% CAGR) for longer generates <strong>substantially more total lifetime gains</strong>. Since you earned significantly more total wealth, the absolute tax amount increases, but your <strong>Net Wealth (Gains minus Tax) is much larger</strong>, extending your years of capital solvency! The solver maximizes Net Gains, not tax minimization in isolation (which could be trivially achieved by earning zero returns).
                            </p>
                            
                            {/* Glowing Vector Flowchart Diagram */}
                            <div className="pt-4 border-t border-white/5">
                              <svg viewBox="0 0 420 110" className="w-full h-auto rounded-xl bg-white/[0.01] border border-white/5 p-3">
                                {/* Pathway 1: Lump Sum */}
                                <text x="10" y="18" className="text-[8px] font-black uppercase fill-white/40">Lump-Sum (1-Yr) Transition</text>
                                <rect x="10" y="24" width="105" height="18" rx="4" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                <text x="62.5" y="35" textAnchor="middle" className="text-[7.5px] font-bold fill-white/60">Immediate De-risking</text>
                                
                                <line x1="115" y1="33" x2="135" y2="33" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" markerEnd="url(#arrow-dark)" />
                                
                                <rect x="135" y="24" width="125" height="18" rx="4" fill="rgba(255,255,255,0.02)" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
                                <text x="197.5" y="35" textAnchor="middle" className="text-[7.5px] font-bold fill-white/60">Lower growth (8.2% Debt)</text>
                                
                                <line x1="260" y1="33" x2="280" y2="33" stroke="rgba(255,255,255,0.2)" strokeWidth="1.2" markerEnd="url(#arrow-dark)" />
                                
                                <rect x="280" y="24" width="130" height="18" rx="4" fill="rgba(239,68,68,0.05)" stroke="rgba(239,68,68,0.2)" strokeWidth="1" />
                                <text x="345" y="35" textAnchor="middle" className="text-[7.5px] font-black fill-red-400">Lower Ending Portfolio</text>

                                {/* Pathway 2: Staged Glide Path */}
                                <text x="10" y="68" className="text-[8px] font-black uppercase fill-[#00FF88]">Staged Glide Path ({effectiveInputs.rebalanceYears}-Yr)</text>
                                <rect x="10" y="74" width="105" height="18" rx="4" fill="rgba(0,255,136,0.03)" stroke="rgba(0,255,136,0.15)" strokeWidth="1" />
                                <text x="62.5" y="85" textAnchor="middle" className="text-[7.5px] font-bold fill-[#00FF88]">Gradual Linear Glide</text>
                                
                                <line x1="115" y1="83" x2="135" y2="83" stroke="#00FF88" strokeWidth="1.2" strokeDasharray="2 2" markerEnd="url(#arrow-green-dark)" />
                                
                                <rect x="135" y="74" width="125" height="18" rx="4" fill="rgba(0,242,254,0.03)" stroke="rgba(0,242,254,0.15)" strokeWidth="1" />
                                <text x="197.5" y="85" textAnchor="middle" className="text-[7.5px] font-bold fill-[#00F2FE]">Stay in Equity (12% CAGR) longer</text>
                                
                                <line x1="260" y1="83" x2="280" y2="83" stroke="#00FF88" strokeWidth="1.2" strokeDasharray="2 2" markerEnd="url(#arrow-green-dark)" />
                                
                                <rect x="280" y="74" width="130" height="18" rx="4" fill="rgba(0,255,136,0.08)" stroke="rgba(0,255,136,0.3)" strokeWidth="1" />
                                <text x="345" y="85" textAnchor="middle" className="text-[7.5px] font-black fill-[#00FF88]">⚡ HIGHER NET WEALTH (Winner!)</text>

                                {/* SVG Marker Definitions */}
                                <defs>
                                  <marker id="arrow-dark" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                    <path d="M 0 2 L 10 5 L 0 8 z" fill="rgba(255,255,255,0.4)" />
                                  </marker>
                                  <marker id="arrow-green-dark" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
                                    <path d="M 0 2 L 10 5 L 0 8 z" fill="#00FF88" />
                                  </marker>
                                </defs>
                              </svg>
                            </div>
                          </div>

                          <p className="italic text-accent/80 font-black text-xs">
                            ▸ Post-retirement rebalance transfers are routed 100% into tax-efficient Debt Mutual Funds, and withdrawals draw from Fixed Deposits first to deplete annually-taxed interest assets.
                          </p>
                        </div>

                        <div className="grid grid-cols-2 gap-4 mt-6">
                          <div className="bg-white/[0.02] border border-white/5 p-5 rounded-xl space-y-3">
                            <div className="text-[10px] font-black uppercase tracking-widest text-white/40">Lump-Sum (1-Yr) Transition</div>
                            <div className="text-sm font-bold text-white/70">Lifetime Tax Outgo: <span className="text-red-400 font-black font-mono text-base">{formatLakhs(taxSavingsReport.lumpSumTax)}</span></div>
                            <div className="text-sm font-bold text-white/70">Portfolio Solvency: <span className="font-black text-base">Age {taxSavingsReport.lumpSumSolvency}</span></div>
                            <div className="text-sm font-bold text-white/70">Ending Portfolio Value ({inputs.endAge}): <span className="font-black font-mono text-base text-accent">{formatToCrores(taxSavingsReport.lumpSumFinalBalance)}</span></div>
                          </div>

                          <div className="bg-[#00FF88]/5 border border-[#00FF88]/20 p-5 rounded-xl space-y-3">
                            <div className="text-[10px] font-black uppercase tracking-widest text-[#00FF88] flex items-center gap-1">
                              {strategyMode === 'optimized' ? '⚡ Optimized Glide Path' : 'Active Glide Path'} ({effectiveInputs.rebalanceYears}-Yr)
                            </div>
                            <div className="text-sm font-bold text-white">Lifetime Tax Outgo: <span className="text-[#00FF88] font-black font-mono text-base">{formatLakhs(taxSavingsReport.activeTax)}</span></div>
                            <div className="text-sm font-bold text-white">Portfolio Solvency: <span className="text-[#00FF88] font-black text-base">Age {taxSavingsReport.activeSolvency}</span></div>
                            <div className="text-sm font-bold text-white">Ending Portfolio Value ({inputs.endAge}): <span className="text-[#00FF88] font-black font-mono text-base">{formatToCrores(taxSavingsReport.activeFinalBalance)}</span></div>
                          </div>
                        </div>

                        <div className="space-y-3 mt-6 border-t border-white/5 pt-6">
                          {taxSavingsReport.savedTax > 0 && (
                            <div className="flex justify-between items-center text-sm bg-[#00FF88]/10 p-4 rounded-xl border border-[#00FF88]/20 font-black">
                              <span className="text-[#00FF88] uppercase tracking-widest text-xs">🔥 Net Lifetime Taxes Saved:</span>
                              <span className="text-[#00FF88] font-mono text-lg">{formatLakhs(taxSavingsReport.savedTax)}</span>
                            </div>
                          )}

                          {taxSavingsReport.solvencyGain > 0 ? (
                            <div className="flex justify-between items-center text-sm bg-accent/10 p-4 rounded-xl border border-accent/20 font-black text-accent">
                              <span className="uppercase tracking-widest text-xs">🚀 Portfolio Lifespan Extended:</span>
                              <span className="font-mono text-lg">+{taxSavingsReport.solvencyGain} Years of Capital Solvency!</span>
                            </div>
                          ) : (
                            <div className="p-3 bg-white/5 rounded-xl border border-white/5 text-[10px] text-center font-bold text-white/40 uppercase tracking-widest">
                              Staged rebalancing matches the baseline longevity path but dramatically lowers immediate tax drag.
                            </div>
                          )}
                        </div>

                        {/* Year-by-Year Staged Rebalancing Transfer Ledger */}
                        <div className="space-y-3 mt-6 border-t border-white/5 pt-6">
                          <div className="text-xs font-black uppercase tracking-widest text-[#00FF88] flex items-center gap-1.5 pl-1">
                            📅 Year-by-Year Staged Rebalancing Ledger
                          </div>
                          
                          {simulationData.records.some(r => r.RebalancedEqSold > 0) ? (
                            <div className="overflow-x-auto rounded-xl border border-white/5 bg-white/[0.01] max-h-[300px] custom-scrollbar">
                              <table className="w-full text-left border-collapse text-[10px] font-mono">
                                <thead>
                                  <tr className="bg-white/5 uppercase font-sans font-black text-white/50 text-[8px] tracking-wider border-b border-white/10 sticky top-0 backdrop-blur-xl">
                                    <th className="px-4 py-3">Age (Year)</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3 text-[#FF4D4D]">Equity Sold</th>
                                    <th className="px-4 py-3 text-[#00FF88]">Debt MF Reinvested</th>
                                    <th className="px-4 py-3 text-[#FF6B35]">LTCG Tax Paid</th>
                                    <th className="px-4 py-3 text-accent">Net Portfolio</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {simulationData.records.filter(r => r.RebalancedEqSold > 0).map((row) => {
                                    const W = effectiveInputs.rebalanceYears;
                                    let type = "Milestone Staged Glide";
                                    
                                    // Determine phase window label
                                    if (row.Age >= effectiveInputs.retirementAge - W + 1 && row.Age <= effectiveInputs.retirementAge) {
                                      type = `Phase 1 Transition (Age ${row.Age} / ${effectiveInputs.retirementAge})`;
                                    } else if (row.Age >= 70 - W + 1 && row.Age <= 70) {
                                      type = `Phase 2 Transition (Age ${row.Age} / 70)`;
                                    } else if (row.Age >= 80 - W + 1 && row.Age <= 80) {
                                      type = `Phase 3 Transition (Age ${row.Age} / 80)`;
                                    }
                                    
                                    return (
                                      <tr key={row.Age} className="border-b border-white/3 hover:bg-white/[0.02] transition-colors">
                                        <td className="px-4 py-2.5 font-bold font-sans text-white/80">{row.Age} ({row.Year})</td>
                                        <td className="px-4 py-2.5 font-bold font-sans text-white/40 text-[9px] uppercase tracking-wider">{type}</td>
                                        <td className="px-4 py-2.5 font-bold text-[#FF4D4D]">{formatLakhs(row.RebalancedEqSold)}</td>
                                        <td className="px-4 py-2.5 font-bold text-[#00FF88]">{formatLakhs(row.RebalancedDbReinvested)}</td>
                                        <td className="px-4 py-2.5 font-bold text-[#FF6B35]">{row.RebalancedTaxPaid > 0 ? formatLakhs(row.RebalancedTaxPaid) : <span className="opacity-40 text-green-400">₹0 (Shielded!)</span>}</td>
                                        <td className="px-4 py-2.5 text-accent font-bold">{formatToCrores(row.Balance)}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <div className="p-6 bg-white/[0.01] rounded-xl border border-white/5 border-dashed text-[10px] text-center font-bold text-white/30 uppercase tracking-widest leading-relaxed">
                              No rebalancing transfers required under the chosen strategy.<br/>
                              <span className="text-[8px] opacity-60 font-sans lowercase">Note: Rebalancing is triggered if your actual Equity ratio exceeds target thresholds.</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Chart legend footer */}
                {viewMode === 'chart' && (
                  <div className="flex justify-center gap-12 mt-4 border-t border-white/5 pt-4 shrink-0">
                    <LegendItem color={HEX.accent} label="Portfolio Balance" />
                    <LegendItem color={HEX.expense} label="Expense Burn" dashed />
                    {enableStress && <LegendItem color={HEX.expense} label="Crisis Shock" isBar />}
                  </div>
                )}
                {viewMode === 'decumulation' && (
                  <div className="flex justify-center gap-8 mt-4 border-t border-white/5 pt-4 shrink-0 flex-wrap">
                    <LegendItem color={HEX.eqSource}  label="Equity Sourced (incl. LTCG harvest)" />
                    <LegendItem color={HEX.dbSource}  label="Debt Sourced" />
                    <LegendItem color={HEX.altSource} label="Alts Sourced" />
                    <LegendItem color={HEX.taxBar}    label="LTCG Tax Paid" isBar />
                    <LegendItem color="#CC2200"       label="Slab Tax Paid" isBar />
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

// ── UI COMPONENTS ────────────────────────────────────────────

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
      className={cn(
        'relative inline-flex h-4 w-7 shrink-0 cursor-pointer rounded-full border border-transparent transition-colors duration-200 ease-in-out focus:outline-none align-middle',
        checked ? 'bg-accent' : 'bg-white/10'
      )}
    >
      <span className={cn(
        'pointer-events-none inline-block h-3 w-3 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out',
        checked ? 'translate-x-3.5' : 'translate-x-0'
      )} />
    </button>
  );
}

function PhaseModalContent({ title, age, alloc, onChange, triggerDesc, taxDesc }: any) {
  const equity = alloc.equity;
  const debt   = alloc.debt;
  const other  = Math.max(0, 100 - (equity + debt));

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="space-y-1">
        <h4 className="text-sm font-black text-white">{title} <span className="text-accent">({age} Yrs)</span></h4>
        <p className="text-[10px] text-white/50">{triggerDesc}</p>
      </div>

      <div className="space-y-2">
        <span className="text-[8px] font-black uppercase tracking-wider opacity-40">Target Asset Distribution</span>
        <div className="flex h-3 w-full rounded-full overflow-hidden bg-white/5 shadow-inner p-0.5 border border-white/5">
          <div style={{ width: `${equity}%`, backgroundColor: HEX.accent }} className="transition-all duration-500" />
          <div style={{ width: `${debt}%`, backgroundColor: HEX.debt }} className="transition-all duration-500" />
          <div style={{ width: `${other}%`, backgroundColor: HEX.alt }} className="transition-all duration-500" />
        </div>
        <div className="flex justify-between text-[9px] font-black uppercase opacity-65 px-1 font-mono">
          <span style={{ color: HEX.accent }}>Equity: {equity}%</span>
          <span style={{ color: HEX.debt }}>Debt: {debt}%</span>
          <span style={{ color: HEX.alt }}>Other/Alts: {other}%</span>
        </div>
      </div>

      <div className="space-y-4 bg-white/[0.02] p-4 rounded-xl border border-white/5">
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-white/50 font-black">Equity Allocation</span>
            <span className="text-accent font-black">{equity}%</span>
          </div>
          <input
            type="range" min="0" max="100" value={equity}
            onChange={(e) => {
              const eq = parseInt(e.target.value) || 0;
              onChange({ equity: eq, debt: Math.min(debt, 100 - eq) });
            }}
            className="w-full accent-accent bg-white/5 rounded-lg h-2"
          />
        </div>
        <div className="space-y-1.5">
          <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
            <span className="text-white/50 font-black">Debt Allocation (Max {100 - equity}%)</span>
            <span className="text-[#7367F0] font-black">{debt}%</span>
          </div>
          <input
            type="range" min="0" max={100 - equity} value={debt}
            onChange={(e) => {
              const db = parseInt(e.target.value) || 0;
              onChange({ ...alloc, debt: db });
            }}
            className="w-full accent-[#7367F0] bg-white/5 rounded-lg h-2"
          />
        </div>
      </div>

      <div className="p-3.5 bg-yellow-400/5 rounded-xl border border-yellow-400/20 text-[10px] leading-relaxed text-yellow-300/80">
        <strong className="text-yellow-300 font-black">Tax Note:</strong> {taxDesc}
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed, isBar }: any) {
  return (
    <div className="flex items-center gap-3">
      {isBar ? (
        <div className="w-3.5 h-3.5 rounded-sm" style={{ backgroundColor: color }} />
      ) : (
        <div className={cn('w-6 h-1.5 rounded-full', dashed && 'border-t-2 border-dashed')} style={{ backgroundColor: dashed ? 'transparent' : color, borderColor: color }} />
      )}
      <span className="text-[10px] uppercase font-black tracking-widest opacity-40 font-mono">{label}</span>
    </div>
  );
}

function HorizontalInputLarge({ label, value, min, max, step = 1, onChange, compact, disabled }: any) {
  return (
    <div className={cn('flex items-center justify-between gap-2', compact ? 'py-0.5' : 'py-1.5', disabled && 'opacity-50')}>
      <span className="text-[10px] font-black uppercase text-white/30 tracking-widest flex-1">{label}</span>
      <input
        type="number" min={min} max={max} step={step} value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="w-20 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-[11px] font-black text-center focus:border-accent transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      />
    </div>
  );
}

function InputGroup({ label, value, min, max, step = 1, onChange }: any) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] uppercase font-black text-accent tracking-[0.2em] block opacity-80 pl-1">{label}</label>
      <input
        type="number" min={min} max={max} step={step} value={value}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        className="bg-white/[0.02] border border-white/10 rounded-xl px-4 py-3 text-xs font-black focus:border-accent w-full focus:outline-none transition-all shadow-xl"
      />
    </div>
  );
}

function CollapsiblePanel({ title, children, panelKey, activePanel, toggle, icon: Icon, toggleSwitch }: any) {
  const isOpen = activePanel === panelKey;
  return (
    <div className="border border-white/5 bg-white/[0.01] rounded-xl overflow-hidden shadow-md">
      <div onClick={() => toggle(panelKey)} className="flex items-center justify-between p-4 bg-white/[0.02] cursor-pointer hover:bg-white/[0.04] transition-colors select-none">
        <div className="flex items-center gap-3">
          {Icon && <Icon className="w-4 h-4 text-accent" />}
          <span className="text-[11px] font-black uppercase tracking-wider text-white">{title}</span>
        </div>
        <div className="flex items-center gap-3">
          {toggleSwitch && toggleSwitch}
          {isOpen ? <ChevronUp className="w-3.5 h-3.5 text-white/40" /> : <ChevronDown className="w-3.5 h-3.5 text-white/40" />}
        </div>
      </div>
      {isOpen && (
        <div className="p-4 border-t border-white/5 bg-black/40 animate-in fade-in slide-in-from-top-1 duration-200">
          {children}
        </div>
      )}
    </div>
  );
}
