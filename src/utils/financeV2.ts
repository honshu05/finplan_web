// ============================================================
// FinPlan Suite – Core Financial Engine V2.0 (Dynamic ALTS Engine)
// Pure deterministic TypeScript – NO AI, NO LLMs, NO stochastic
// ============================================================

export interface HistoricalDataRecord {
  Year: number;
  Sensex: number;
  USD_INR: number;
  Gold: number;
  Property: number;
  Sensex_Rebased: number;
  USD_INR_Rebased: number;
  Gold_Rebased: number;
  Property_Rebased: number;
}

export interface SimulationRecord {
  Year: number;
  Age: number;
  Expense: number;
  Balance: number;
  Equity: number;
  Debt: number;
  DebtFD: number;         // Fixed Deposit balance
  DebtMF: number;         // Debt Mutual Fund balance
  Other: number;          // Gold/Silver
  Shock: number;
  IncomeAdded: number;    // Annual income added (pre-retirement years only)
  
  // V0.4 – Tax-Aware Decumulation Ledger Fields
  EqSourced: number;      // Equity drawn this year (post-retirement)
  DbSourced: number;      // Debt drawn this year (post-retirement)
  AltSourced: number;     // Alts drawn this year (post-retirement)
  LTCGExempted: number;   // Gain shielded by ₹1.25L annual LTCG exemption
  LTCGTaxPaid: number;    // LTCG tax actually paid (12.5% on excess)
  SlabTaxPaid: number;    // Income/slab tax on interest this year
  
  // Rebalancing details
  RebalancedEqSold: number;
  RebalancedDbReinvested: number;
  RebalancedTaxPaid: number;

  // V2.0 – Dynamic ALTS Bucket Allocations & Audit Fields
  Bucket1?: number;       // Liquid LDI target debt folio
  Bucket2?: number;       // Pfau-Kitces transition core
  Bucket3?: number;       // High-Octane compounder
  rEqUsed?: number;       // Equity return used in this year
  inflationUsed?: number; // General inflation used in this year
}

export interface PhaseAllocation {
  equity: number;
  debt: number;
}

export interface SimulationInputs {
  currentAge: number;
  retirementAge: number;
  endAge: number;
  domesticEquity: number;
  intlEquity: number;
  fdAssets: number;             // Fixed Deposits in ₹ Lakhs
  debtMfAssets: number;         // Debt Mutual Funds in ₹ Lakhs
  goldAssets: number;
  silverAssets: number;
  annualSavings: number;        // Annual savings in ₹ Lakhs (pre-retirement)
  incomeGrowthRate: number;    // % per year
  monthlyExpenses: number;
  medicalInsurance: number;
  rebalanceYears: number;       // Transition staging window in years (1 to 7)
  phase1Alloc: PhaseAllocation;
  phase2Alloc: PhaseAllocation;
  phase3Alloc: PhaseAllocation;

  // V2.0 Inputs
  macroRegime?: 'india' | 'china' | 'japan';
  runMode?: 'forecast' | 'historical';
  historicalStartYear?: number;
  altsEnabled?: boolean;
}

export interface OptimizedStrategy {
  phase1Alloc: PhaseAllocation;
  phase2Alloc: PhaseAllocation;
  phase3Alloc: PhaseAllocation;
  rebalanceYears: number;       // Optimized rebalancing window
  solvencyAge: number;
  improved: boolean;            // true if better than manual
}

// ============================================================
// TAX CALCULATIONS  (FY 2025-26 New Regime)
// ============================================================

export function calculateGranularTax(taxableIncome: number): number {
  // FY 2025-26 New Regime (Budget 2025)
  // Standard deduction ₹75,000 for salaried / pensioners
  const stdDeduction = 75000;
  const income = Math.max(0, taxableIncome - stdDeduction);

  // Section 87A Rebate: Income ≤1200000 (₹12L) → effective tax = 0
  if (income <= 1200000) return 0;

  // FY 2025-26 slabs
  let tax = 0;
  if (income >  400000) tax += Math.min(income -  400000,  400000) * 0.05; // 4–8L:  5%
  if (income >  800000) tax += Math.min(income -  800000,  400000) * 0.10; // 8–12L: 10%
  if (income > 1200000) tax += Math.min(income - 1200000,  400000) * 0.15; // 12–16L: 15%
  if (income > 1600000) tax += Math.min(income - 1600000,  400000) * 0.20; // 16–20L: 20%
  if (income > 2000000) tax += Math.min(income - 2000000,  400000) * 0.25; // 20–24L: 25%
  if (income > 2400000) tax += (income - 2400000) * 0.30;                   // >24L:  30%

  // Surcharge on total income
  let surchargeRate = 0;
  if      (income > 50000000) surchargeRate = 0.37; // >5Cr
  else if (income > 20000000) surchargeRate = 0.25; // >2Cr
  else if (income > 10000000) surchargeRate = 0.15; // >1Cr
  else if (income >  5000000) surchargeRate = 0.10; // >50L

  return tax * (1 + surchargeRate) * 1.04; // 4% Health & Education Cess
}

/** Returns { ltcgTax, ltcgExempted } for a given equity withdrawal */
export function calcEquityLTCGDetail(withdrawalAmount: number): {
  ltcgTax: number;
  ltcgExempted: number;
} {
  // Conservative assumption: 70% of withdrawal is long-term capital gain
  const gainPortion = withdrawalAmount * 0.7;
  const exemptionLimit = 125000; // ₹1.25L
  const ltcgExempted = Math.min(gainPortion, exemptionLimit);
  const taxableGain = Math.max(0, gainPortion - exemptionLimit);

  let surchargeRate = 0;
  if (gainPortion > 50000000) surchargeRate = 0.15;
  else if (gainPortion > 20000000) surchargeRate = 0.15;
  else if (gainPortion > 10000000) surchargeRate = 0.15;
  else if (gainPortion > 5000005) surchargeRate = 0.10;

  const baseTax = taxableGain * 0.125;
  const ltcgTax = baseTax * (1 + surchargeRate) * 1.04;
  return { ltcgTax, ltcgExempted };
}

/** Legacy wrapper kept for rebalancing events */
export function calculateEquityLTCG(withdrawalAmount: number): number {
  return calcEquityLTCGDetail(withdrawalAmount).ltcgTax;
}

// ============================================================
// DEMOGRAPHIC-ADJUSTED MACRO SCENARIO DEFAULTS
// ============================================================

export function getDemographicAdjustedRates(
  age: number,
  retirementAge: number,
  regime: 'india' | 'china' | 'japan'
) {
  const yearsInRetirement = age - retirementAge;
  
  if (regime === 'china') {
    if (yearsInRetirement <= 0) {
      // Pre-retirement
      return { rEq: 0.095, rDebt: 0.060, inflation: 0.05, rGold: 0.06, rProperty: 0.05 };
    } else if (yearsInRetirement <= 5) {
      // Phase 1 (Years 1-5 of retirement)
      return { rEq: 0.095, rDebt: 0.060, inflation: 0.05, rGold: 0.06, rProperty: 0.05 };
    } else {
      // Phase 2 (Years 6+ of retirement)
      return { rEq: 0.065, rDebt: 0.045, inflation: 0.03, rGold: 0.04, rProperty: 0.03 };
    }
  } else if (regime === 'japan') {
    // Japan deflationary stagnation regime (lost decades stress test)
    return { rEq: 0.020, rDebt: 0.005, inflation: 0.005, rGold: 0.02, rProperty: 0.01 };
  } else {
    // Default: 'india' (Peak Demographic Dividend transitioning to Cooldown)
    if (yearsInRetirement <= 0) {
      return { rEq: 0.115, rDebt: 0.082, inflation: 0.07, rGold: 0.075, rProperty: 0.07 };
    } else if (yearsInRetirement <= 10) {
      return { rEq: 0.115, rDebt: 0.082, inflation: 0.07, rGold: 0.075, rProperty: 0.07 };
    } else if (yearsInRetirement <= 25) {
      return { rEq: 0.095, rDebt: 0.065, inflation: 0.05, rGold: 0.06, rProperty: 0.05 };
    } else {
      return { rEq: 0.080, rDebt: 0.050, inflation: 0.04, rGold: 0.05, rProperty: 0.04 };
    }
  }
}

// ============================================================
// CORE SIMULATION ENGINE (V2.0 Upgraded)
// ============================================================

export function runSimulation(
  mktVal: number,
  inputs: SimulationInputs,
  illF: number = 999,
  illA: number = 0,
  activeLogic: boolean = false,
  historicalData?: HistoricalDataRecord[]
) {
  const records: SimulationRecord[] = [];

  let bEq = (inputs.domesticEquity + inputs.intlEquity) * 1e5;
  
  // Split Debt Assets
  const startingFd = inputs.fdAssets !== undefined ? inputs.fdAssets * 1e5 : 2.5e5;
  const startingMf = inputs.debtMfAssets !== undefined ? inputs.debtMfAssets * 1e5 : 2.5e5;

  let bDebtFD = startingFd;
  let bDebtMF = startingMf;
  let principalDbMF = bDebtMF; // Initialize cost basis of Debt Mutual Funds
  let bOther = (inputs.goldAssets + inputs.silverAssets) * 1e5;

  let runOutAge: number | null = null;
  const currYear = new Date().getFullYear();

  // State to track starting equity ratios for linear rebalancing glides (V0.4 mode only)
  let startEqPctP1: number | null = null;
  let startEqPctP2: number | null = null;
  let startEqPctP3: number | null = null;

  const regime = inputs.macroRegime || 'india';
  const numYearsSim = inputs.endAge - inputs.currentAge + 1;

  // ============================================================================
  // PRE-CALCULATE INFLATED EXPENSES & NPV LDI TARGET DEBT FOLIO (IN REVERSE)
  // ============================================================================
  const expenses: number[] = [];
  for (let age = inputs.currentAge; age <= inputs.endAge; age++) {
    const y = age - inputs.currentAge;
    
    // Core inflation and medical inflation depends on regime
    let inflRate = 0.07;
    let medInflRate = 0.15;

    if (inputs.runMode === 'historical' && historicalData && historicalData.length > 0) {
      if (regime === 'japan') {
        inflRate = 0.005;
        medInflRate = 0.08;
      } else if (regime === 'china') {
        inflRate = 0.04;
        medInflRate = 0.10;
      } else {
        inflRate = 0.07;
        medInflRate = 0.15;
      }
    } else {
      const rates = getDemographicAdjustedRates(age, inputs.retirementAge, regime);
      inflRate = rates.inflation;
      if (regime === 'japan') medInflRate = 0.08;
      else if (regime === 'china') medInflRate = 0.10;
      else medInflRate = 0.15;
    }

    const cCore = (inputs.monthlyExpenses * 12 * 1e5) * Math.pow(1 + inflRate, y);
    const cMed = (inputs.medicalInsurance * 1e5) * Math.pow(1 + medInflRate, y);
    const illHit = (y > 0 && y % illF === 0) ? (illA * 1e5) * Math.pow(1 + medInflRate, y) : 0;

    expenses.push(cCore + cMed + illHit);
  }

  // Pre-calculate target LDI for each year in reverse from simulated age of death back to current age
  const targetLDI: number[] = new Array(numYearsSim).fill(0);
  const baseDebtYield = regime === 'japan' ? 0.005 : (regime === 'china' ? 0.06 : 0.082);
  const rDebtPostTax = baseDebtYield * 0.75; // discount with conservative post-tax yield (~25% tax drag)

  for (let i = numYearsSim - 1; i >= 0; i--) {
    const yearlyExp = expenses[i];
    const monthlyExp = yearlyExp / 12;
    const emergencyBuffer = monthlyExp * 6; // Mandatory 6-month emergency reserve

    let npvFuture = 0;
    const maxYears = Math.min(5, numYearsSim - 1 - i);
    for (let k = 1; k <= maxYears; k++) {
      npvFuture += expenses[i + k] / Math.pow(1 + rDebtPostTax, k);
    }

    targetLDI[i] = npvFuture + emergencyBuffer;
  }

  // ============================================================================
  // MAIN SIMULATION LOOP
  // ============================================================================
  for (let age = inputs.currentAge; age <= inputs.endAge; age++) {
    const y = age - inputs.currentAge;
    const isRet = age >= inputs.retirementAge;
    const totalAssets = bEq + bDebtFD + bDebtMF + bOther;

    let ltcgTaxPaid  = 0;
    let ltcgExempted = 0;

    // Track rebalancing transactions this year
    let rebalEqSold = 0;
    let rebalDbReinvested = 0;
    let rebalTaxPaid = 0;

    // Bucket states for records
    let recB1 = 0;
    let recB2 = 0;
    let recB3 = 0;

    // ── Macro Rates Determination ─────────────────────────────
    let rEq = mktVal / 100;
    let rDebt = baseDebtYield;
    let rOther = 0.075;
    let inflationRate = 0.07;
    let medicalInflationRate = 0.15;

    if (inputs.runMode === 'historical' && historicalData && historicalData.length > 0) {
      const startYear = inputs.historicalStartYear || 1986;
      const currentSimYear = startYear + y;
      
      const totalYears = 2026 - 1980 + 1;
      const getWrappedYear = (year: number) => {
        let yVal = year;
        while (yVal > 2026) yVal -= totalYears;
        while (yVal < 1980) yVal += totalYears;
        return yVal;
      };

      const targetYear = getWrappedYear(currentSimYear);
      const prevYear = getWrappedYear(currentSimYear - 1);

      const rec = historicalData.find(d => d.Year === targetYear);
      const prevRec = historicalData.find(d => d.Year === prevYear);

      if (rec && prevRec) {
        // Compute returns from indices
        rEq = prevRec.Sensex > 0 ? (rec.Sensex / prevRec.Sensex) - 1 : 0.12;
        rOther = prevRec.Gold > 0 ? (rec.Gold / prevRec.Gold) - 1 : 0.075;
        
        if (regime === 'japan') {
          rDebt = 0.005;
          inflationRate = 0.005;
          medicalInflationRate = 0.08;
        } else if (regime === 'china') {
          rDebt = 0.06;
          inflationRate = 0.04;
          medicalInflationRate = 0.10;
        } else {
          rDebt = 0.082;
          inflationRate = 0.07;
          medicalInflationRate = 0.15;
        }
      }
    } else {
      const rates = getDemographicAdjustedRates(age, inputs.retirementAge, regime);
      rEq = rates.rEq;
      rDebt = rates.rDebt;
      rOther = rates.rGold;
      inflationRate = rates.inflation;
      if (regime === 'japan') medicalInflationRate = 0.08;
      else if (regime === 'china') medicalInflationRate = 0.10;
      else medicalInflationRate = 0.15;
    }

    // ── V2.0 Dynamic 3-Bucket ALTS Allocation Engine ─────────
    if (inputs.altsEnabled && totalAssets > 0) {
      const targetDebtVal = targetLDI[y];

      // Calculate Pfau-Kitces Transition Core (Bucket 2: years 6 to 15) Target
      let targetBucket2Size = 0;
      const startB2 = y + 6;
      const endB2 = Math.min(y + 15, numYearsSim - 1);
      for (let k = startB2; k <= endB2; k++) {
        targetBucket2Size += expenses[k] / Math.pow(1 + rDebtPostTax, k - y);
      }

      // Segment current assets into buckets
      if (totalAssets <= targetDebtVal) {
        recB1 = totalAssets;
        recB2 = 0;
        recB3 = 0;
      } else if (totalAssets <= targetDebtVal + targetBucket2Size) {
        recB1 = targetDebtVal;
        recB2 = totalAssets - targetDebtVal;
        recB3 = 0;
      } else {
        recB1 = targetDebtVal;
        recB2 = targetBucket2Size;
        recB3 = totalAssets - targetDebtVal - targetBucket2Size;
      }

      // Strong Market Harvesting (>12% Equity Return) or First Year Initial Setup
      if (y === 0 || rEq > 0.12) {
        // Compute desired asset proportions across Equity, Debt and Gold
        const targetDebtTotal = recB1 + (recB2 * 0.30);
        const targetEqTotal = (recB2 * 0.70) + (recB3 * 0.80);
        const targetGoldTotal = recB3 * 0.20;

        // Smart, tax-efficient debt split: Hold the emergency fund portion in FD for liquid safety, rest in Debt MF
        const emergencyLimit = expenses[y] / 2; // 6 months
        const targetFD = Math.min(targetDebtTotal, emergencyLimit);
        const targetMF = targetDebtTotal - targetFD;

        // Perform actual rebalancing with tax consideration
        if (bEq > targetEqTotal && y > 0) {
          const soldEq = bEq - targetEqTotal;
          // Apply LTCG tax
          const tax = soldEq * 0.70 * 0.125;
          const netProceeds = soldEq - tax;
          
          bEq = targetEqTotal;
          bDebtMF += netProceeds;
          principalDbMF += netProceeds;
          bDebtFD = targetFD;
          bOther = targetGoldTotal;

          rebalEqSold = soldEq;
          rebalDbReinvested = netProceeds;
          rebalTaxPaid = tax;
          ltcgTaxPaid += tax;
        } else {
          // Normal allocations matching bucket segmentation
          bEq = targetEqTotal;
          bDebtFD = targetFD;
          bDebtMF = targetMF;
          bOther = targetGoldTotal;
        }
      } else {
        // Flat/Down market (rEq <= 12%): DO NOT harvest from Equity. 
        // Let Bucket 1 burn down. Rising Equity Glidepath in action!
      }
    } else if (activeLogic && totalAssets > 0) {
      // ── V0.4 Traditional Glide Path Rebalancing Mode ──────────────────
      const W = Math.max(1, inputs.rebalanceYears ?? 5);

      const doGlideRebalance = (
        mAge: number,
        phaseAlloc: PhaseAllocation,
        startState: { get: () => number | null; set: (v: number) => void }
      ) => {
        const wStart = mAge - W + 1;
        const wEnd = mAge;
        
        if (age >= wStart && age <= wEnd) {
          if (startState.get() === null) {
            startState.set((bEq / totalAssets) * 100);
          }
          const startPct = startState.get() ?? (bEq / totalAssets) * 100;
          const endPct = phaseAlloc.equity;
          
          if (startPct > endPct) {
            const step = age - wStart + 1;
            const targetPct = startPct - (startPct - endPct) * (step / W);
            const currentPct = (bEq / totalAssets) * 100;
            
            if (currentPct > targetPct) {
              const targetEqAmt = totalAssets * (targetPct / 100);
              const soldEq = bEq - targetEqAmt;
              if (soldEq > 0) {
                const tax = calculateEquityLTCG(soldEq);
                const netProceeds = soldEq - tax;
                bEq -= soldEq;
                
                bDebtMF += netProceeds;
                principalDbMF += netProceeds;
                
                rebalEqSold = soldEq;
                rebalDbReinvested = netProceeds;
                rebalTaxPaid = tax;
                ltcgTaxPaid += tax;
              }
            }
          }
        }
      };

      const p1Ref = { get: () => startEqPctP1, set: (v: number) => { startEqPctP1 = v; } };
      const p2Ref = { get: () => startEqPctP2, set: (v: number) => { startEqPctP2 = v; } };
      const p3Ref = { get: () => startEqPctP3, set: (v: number) => { startEqPctP3 = v; } };

      doGlideRebalance(inputs.retirementAge, inputs.phase1Alloc, p1Ref);
      doGlideRebalance(70,                  inputs.phase2Alloc, p2Ref);
      doGlideRebalance(80,                  inputs.phase3Alloc, p3Ref);
    }

    // ── Apply Growth/Returns ──────────────────────────────────
    const interestEq   = bEq   * rEq;
    const interestDbFD = bDebtFD * rDebt;
    const interestDbMF = bDebtMF * rDebt;
    const interestOt   = bOther * rOther;

    bEq    += interestEq;
    bDebtFD += interestDbFD;
    bDebtMF += interestDbMF;
    bOther += interestOt;

    // ── Get Year's Inflated Expense ────────────────────────────
    const yearlyExpense = expenses[y];
    const illHit = (y > 0 && y % illF === 0) ? (illA * 1e5) * Math.pow(1 + medicalInflationRate, y) : 0;

    // ── Sourcing & Decumulation ──────────────────────────────
    let eqSourced    = 0;
    let dbSourced    = 0;
    let altSourced   = 0;
    let slabTaxPaid  = 0;
    let incomeAdded  = 0;

    if (!isRet) {
      // ── PRE-RETIREMENT: Proportional savings additions ──
      const growthRate = (inputs.incomeGrowthRate ?? 7) / 100;
      const inflatedIncome = (inputs.annualSavings * 1e5) * Math.pow(1 + growthRate, y);
      incomeAdded = inflatedIncome;
      
      const totalPreInc = bEq + bDebtFD + bDebtMF + bOther;
      if (totalPreInc > 0) {
        bEq += inflatedIncome * (bEq / totalPreInc);
        
        const newDebtAddition = inflatedIncome * ((bDebtFD + bDebtMF) / totalPreInc);
        const debtTotal = bDebtFD + bDebtMF;
        if (debtTotal > 0) {
          const newFd = newDebtAddition * (bDebtFD / debtTotal);
          const newMf = newDebtAddition * (bDebtMF / debtTotal);
          bDebtFD += newFd;
          bDebtMF += newMf;
          principalDbMF += newMf;
        } else {
          bDebtFD += newDebtAddition * 0.5;
          bDebtMF += newDebtAddition * 0.5;
          principalDbMF += newDebtAddition * 0.5;
        }
        
        bOther += inflatedIncome * (bOther / totalPreInc);
      } else {
        bEq += inflatedIncome;
      }

      // Pre-retirement taxes: FD interest is taxed annually at slab rates
      const taxableIncome = inflatedIncome + interestDbFD;
      const annualTax = calculateGranularTax(taxableIncome);
      slabTaxPaid = annualTax;

      // Draw outflows pre-retirement (expenses + taxes) from Debt (FD first, then MF)
      let totalOutflow = yearlyExpense + annualTax;
      if (bDebtFD >= totalOutflow) {
        bDebtFD -= totalOutflow;
        dbSourced = totalOutflow;
      } else {
        dbSourced = bDebtFD;
        totalOutflow -= bDebtFD;
        bDebtFD = 0;

        if (bDebtMF >= totalOutflow) {
          bDebtMF -= totalOutflow;
          dbSourced += totalOutflow;
          const prop = bDebtMF > 0 ? (principalDbMF / bDebtMF) : 1;
          const principalDrawn = totalOutflow * Math.min(1, Math.max(0, prop));
          principalDbMF -= principalDrawn;
          totalOutflow = 0;
        } else {
          dbSourced += bDebtMF;
          principalDbMF = 0;
          totalOutflow -= bDebtMF;
          bDebtMF = 0;

          if (bOther >= totalOutflow) {
            bOther -= totalOutflow;
            altSourced = totalOutflow;
          } else {
            altSourced = bOther;
            totalOutflow -= bOther;
            bOther = 0;
            const { ltcgTax, ltcgExempted: ex } = calcEquityLTCGDetail(totalOutflow);
            bEq -= (totalOutflow + ltcgTax);
            eqSourced = totalOutflow;
            ltcgTaxPaid += ltcgTax;
            ltcgExempted += ex;
          }
        }
      }
    } else {
      // ── POST-RETIREMENT: Tax-Aware Dual-Source Waterfall with FD & Debt MF ──────
      
      // Step 1 – Harvest up to ₹1.25L LTCG exemption from Equity every year
      const HARVEST_SALE = 125000 / 0.70;
      let harvestSale = 0;
      if (bEq >= HARVEST_SALE) {
        harvestSale = HARVEST_SALE;
        bEq -= harvestSale;
        
        bDebtMF += harvestSale;
        principalDbMF += harvestSale;
        ltcgExempted += harvestSale * 0.70;
      }
      eqSourced += harvestSale;

      // Step 2 – Solve for Debt Sourcing and Slab Tax via Convergence Loop
      let currentSlabTax = calculateGranularTax(interestDbFD);
      let prevTax = -1;
      let dbFdSourced = 0;
      let dbMfSourced = 0;
      let dbMfGainsTaxable = 0;
      let dbMfPrincipalDrawn = 0;

      for (let iter = 0; iter < 5; iter++) {
        if (Math.abs(currentSlabTax - prevTax) < 1) break;
        prevTax = currentSlabTax;

        const totalNeeded = yearlyExpense + currentSlabTax;
        
        if (bDebtFD >= totalNeeded) {
          dbFdSourced = totalNeeded;
          dbMfSourced = 0;
          dbMfGainsTaxable = 0;
          dbMfPrincipalDrawn = 0;
        } else {
          dbFdSourced = bDebtFD;
          const remainingNeeded = totalNeeded - bDebtFD;
          
          if (bDebtMF >= remainingNeeded) {
            dbMfSourced = remainingNeeded;
          } else {
            dbMfSourced = bDebtMF;
          }
          
          const prop = bDebtMF > 0 ? (principalDbMF / bDebtMF) : 1;
          dbMfPrincipalDrawn = dbMfSourced * Math.min(1, Math.max(0, prop));
          dbMfGainsTaxable = Math.max(0, dbMfSourced - dbMfPrincipalDrawn);
        }

        currentSlabTax = calculateGranularTax(interestDbFD + dbMfGainsTaxable);
      }

      slabTaxPaid = currentSlabTax;
      dbSourced = dbFdSourced + dbMfSourced;

      bDebtFD -= dbFdSourced;
      bDebtMF -= dbMfSourced;
      principalDbMF -= dbMfPrincipalDrawn;

      // Step 3 – If Debt wasn't enough, draw the remaining required from Alts then Equity
      let remainingNeeded = (yearlyExpense + slabTaxPaid) - dbSourced;
      if (remainingNeeded > 0) {
        if (bOther >= remainingNeeded) {
          bOther -= remainingNeeded;
          altSourced = remainingNeeded;
        } else {
          altSourced = bOther;
          remainingNeeded -= bOther;
          bOther = 0;

          // Draw from Equity
          const { ltcgTax, ltcgExempted: ex } = calcEquityLTCGDetail(remainingNeeded);
          bEq -= (remainingNeeded + ltcgTax);
          eqSourced += remainingNeeded;
          ltcgTaxPaid += ltcgTax;
          ltcgExempted += ex;
        }
      }
    }

    // ── Guard against negative balances ──────────────────────
    const currentBalance = bEq + bDebtFD + bDebtMF + bOther;
    if (currentBalance < 0 || bEq < 0 || bDebtFD < 0 || bDebtMF < 0 || bOther < 0) {
      bEq = Math.max(0, bEq);
      bDebtFD = Math.max(0, bDebtFD);
      bDebtMF = Math.max(0, bDebtMF);
      bOther = Math.max(0, bOther);
      if (runOutAge === null && age >= inputs.retirementAge) runOutAge = age;
    }

    records.push({
      Year: currYear + y,
      Age: age,
      Expense: yearlyExpense,
      Balance: bEq + bDebtFD + bDebtMF + bOther,
      Equity: bEq,
      Debt: bDebtFD + bDebtMF,
      DebtFD: bDebtFD,
      DebtMF: bDebtMF,
      Other: bOther,
      Shock: illHit,
      IncomeAdded:  incomeAdded,
      EqSourced:    eqSourced,
      DbSourced:    dbSourced,
      AltSourced:   altSourced,
      LTCGExempted: ltcgExempted,
      LTCGTaxPaid:  ltcgTaxPaid,
      SlabTaxPaid:  slabTaxPaid,
      RebalancedEqSold: rebalEqSold,
      RebalancedDbReinvested: rebalDbReinvested,
      RebalancedTaxPaid: rebalTaxPaid,
      
      // V2.0 fields
      Bucket1: recB1,
      Bucket2: recB2,
      Bucket3: recB3,
      rEqUsed: rEq,
      inflationUsed: inflationRate
    });
  }

  return { records, outAge: runOutAge ?? inputs.endAge };
}

// ============================================================
// V0.4 – DETERMINISTIC SOLVENCY OPTIMIZER
// ============================================================

export function optimizeRebalancingTargets(
  inputs: SimulationInputs,
  stressParams: { mktReturn: number; illFreq: number; illAmt: number },
  enableStress: boolean
): OptimizedStrategy {
  const mktVal = enableStress ? stressParams.mktReturn : 12;
  const illF   = enableStress ? stressParams.illFreq   : 999;
  const illA   = enableStress ? stressParams.illAmt    : 0;

  const baseResult = runSimulation(mktVal, inputs, illF, illA, true);
  const baseTax = baseResult.records.reduce((sum, r) => sum + r.LTCGTaxPaid + r.SlabTaxPaid, 0);

  let bestSolvency = baseResult.outAge;
  let bestTax = baseTax;
  let bestPhase1 = inputs.phase1Alloc;
  let bestPhase2 = inputs.phase2Alloc;
  let bestPhase3 = inputs.phase3Alloc;
  let bestRebalanceYears = inputs.rebalanceYears ?? 5;

  const STEPS = [10, 20, 30, 40, 50, 60, 70, 80];
  const WINDOWS = [3, 5, 7];

  for (const w of WINDOWS) {
    for (const eqP1 of STEPS) {
      const dbP1 = Math.min(90 - eqP1, 80);
      for (const eqP2 of STEPS) {
        if (eqP2 > eqP1) continue;
        const dbP2 = Math.min(90 - eqP2, 80);
        for (const eqP3 of STEPS) {
          if (eqP3 > eqP2) continue;
          const dbP3 = Math.min(90 - eqP3, 80);

          const testInputs: SimulationInputs = {
            ...inputs,
            rebalanceYears: w,
            phase1Alloc: { equity: eqP1, debt: dbP1 },
            phase2Alloc: { equity: eqP2, debt: dbP2 },
            phase3Alloc: { equity: eqP3, debt: dbP3 },
          };

          const result = runSimulation(mktVal, testInputs, illF, illA, true);
          const totalTax = result.records.reduce((sum, r) => sum + r.LTCGTaxPaid + r.SlabTaxPaid, 0);

          if (
            result.outAge > bestSolvency ||
            (result.outAge === bestSolvency && totalTax < bestTax)
          ) {
            bestSolvency = result.outAge;
            bestTax = totalTax;
            bestPhase1 = { equity: eqP1, debt: dbP1 };
            bestPhase2 = { equity: eqP2, debt: dbP2 };
            bestPhase3 = { equity: eqP3, debt: dbP3 };
            bestRebalanceYears = w;
          }
        }
      }
    }
  }

  return {
    phase1Alloc: bestPhase1,
    phase2Alloc: bestPhase2,
    phase3Alloc: bestPhase3,
    rebalanceYears: bestRebalanceYears,
    solvencyAge: bestSolvency,
    improved: bestSolvency > baseResult.outAge || (bestSolvency === baseResult.outAge && bestTax < baseTax),
  };
}
