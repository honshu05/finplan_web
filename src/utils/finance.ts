// ============================================================
// FinPlan Suite – Core Financial Engine  (V0.4)
// Pure deterministic TypeScript – NO AI, NO LLMs, NO stochastic
// ============================================================

export interface SimulationRecord {
  Year: number;
  Age: number;
  Expense: number;
  Balance: number;
  Equity: number;
  Debt: number;
  DebtFD: number;         // Fixed Deposit balance
  DebtMF: number;         // Debt Mutual Fund balance
  Other: number;
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
  annualSavings: number;        // Annual income in ₹ Lakhs (pre-retirement)
  incomeGrowthRate: number;    // % per year – default 7 (inflation rate)
  monthlyExpenses: number;
  medicalInsurance: number;
  rebalanceYears: number;       // Transition staging window in years (1 to 7)
  phase1Alloc: PhaseAllocation;
  phase2Alloc: PhaseAllocation;
  phase3Alloc: PhaseAllocation;
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
  // (Max rebate ₹60,000; tax at 12L income with these slabs = exactly ₹60,000)
  if (income <= 1200000) return 0;

  // FY 2025-26 slabs (from 0 for incomes above the 12L rebate cliff)
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
  else if (gainPortion > 5000000) surchargeRate = 0.10;

  const baseTax = taxableGain * 0.125;
  const ltcgTax = baseTax * (1 + surchargeRate) * 1.04;
  return { ltcgTax, ltcgExempted };
}

/** Legacy wrapper kept for rebalancing events */
export function calculateEquityLTCG(withdrawalAmount: number): number {
  return calcEquityLTCGDetail(withdrawalAmount).ltcgTax;
}

// ============================================================
// CORE SIMULATION ENGINE
// ============================================================

export function runSimulation(
  mktVal: number,
  inputs: SimulationInputs,
  illF: number = 999,
  illA: number = 0,
  activeLogic: boolean = false
) {
  const records: SimulationRecord[] = [];

  let bEq = (inputs.domesticEquity + inputs.intlEquity) * 1e5;
  
  // Split Debt Assets
  const fdPct = 50; // default split if not provided, though we now ask separately
  const startingFd = inputs.fdAssets !== undefined ? inputs.fdAssets * 1e5 : (inputs.debtMfAssets !== undefined ? 0 : (inputs.goldAssets > 0 ? 2.5e5 : 2.5e5));
  const startingMf = inputs.debtMfAssets !== undefined ? inputs.debtMfAssets * 1e5 : (inputs.fdAssets !== undefined ? 0 : (inputs.goldAssets > 0 ? 2.5e5 : 2.5e5));

  let bDebtFD = startingFd;
  let bDebtMF = startingMf;
  let principalDbMF = bDebtMF; // Initialize cost basis of Debt Mutual Funds

  let bOther = (inputs.goldAssets + inputs.silverAssets) * 1e5;

  const rEq   = mktVal / 100;
  const rDebt = 0.082;
  const rOther = 0.075;

  let runOutAge: number | null = null;
  const currYear = new Date().getFullYear();

  // State to track starting equity ratios for linear rebalancing glides
  let startEqPctP1: number | null = null;
  let startEqPctP2: number | null = null;
  let startEqPctP3: number | null = null;

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

    // ── Phase Rebalancing (Staged 1-7 Year Linear Glide Path) ──────────────────
    if (activeLogic && totalAssets > 0) {
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
                
                // Reinvest 100% in tax-efficient Debt MF
                bDebtMF += netProceeds;
                principalDbMF += netProceeds; // Add to MF principal cost basis
                
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

    // ── Annual Expenses ──────────────────────────────────────
    const cCore  = (inputs.monthlyExpenses * 12 * 1e5) * Math.pow(1.07, y);
    const cMed   = (inputs.medicalInsurance * 1e5)     * Math.pow(1.15, y);
    const illHit = (y > 0 && y % illF === 0) ? (illA * 1e5) * Math.pow(1.15, y) : 0;
    const yearlyExpense = cCore + cMed + illHit;

    // ── Growth ───────────────────────────────────────────────
    const interestEq   = bEq   * rEq;
    const interestDbFD = bDebtFD * rDebt;
    const interestDbMF = bDebtMF * rDebt;
    const interestOt   = bOther * rOther;

    bEq    += interestEq;
    bDebtFD += interestDbFD;
    bDebtMF += interestDbMF;
    bOther += interestOt;

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
          // If starting debt was 0, split 50/50
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
          // Reduce cost basis of MF proportionally
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
      const HARVEST_SALE = 125000 / 0.70;   // ~₹1.79L
      let harvestSale = 0;
      if (bEq >= HARVEST_SALE) {
        harvestSale = HARVEST_SALE;
        bEq -= harvestSale;
        
        // Reinvest 100% in tax-deferred Debt MF (never into FDs post-retirement to prevent annual tax)
        bDebtMF += harvestSale;
        principalDbMF += harvestSale; // add to cost basis
        ltcgExempted += harvestSale * 0.70;
      }
      eqSourced += harvestSale;

      // Step 2 – Solve for Debt Sourcing and Slab Tax via Convergence Loop (5 iterations)
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

      // Deduct the sourced amounts from pools
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
    });
  }

  return { records, outAge: runOutAge ?? inputs.endAge };
}

// ============================================================
// V0.4 – DETERMINISTIC SOLVENCY OPTIMIZER
// Pure grid search – NO AI, NO LLMs, NO randomness
// ============================================================

export function optimizeRebalancingTargets(
  inputs: SimulationInputs,
  stressParams: { mktReturn: number; illFreq: number; illAmt: number },
  enableStress: boolean
): OptimizedStrategy {
  const mktVal = enableStress ? stressParams.mktReturn : 12;
  const illF   = enableStress ? stressParams.illFreq   : 999;
  const illA   = enableStress ? stressParams.illAmt    : 0;

  // Evaluate baseline (manual strategy)
  const baseResult = runSimulation(mktVal, inputs, illF, illA, true);
  const baseTax = baseResult.records.reduce((sum, r) => sum + r.LTCGTaxPaid + r.SlabTaxPaid, 0);

  let bestSolvency = baseResult.outAge;
  let bestTax = baseTax;
  let bestPhase1 = inputs.phase1Alloc;
  let bestPhase2 = inputs.phase2Alloc;
  let bestPhase3 = inputs.phase3Alloc;
  let bestRebalanceYears = inputs.rebalanceYears ?? 5;

  // Grid: equity 10%…80% in 10% steps
  const STEPS = [10, 20, 30, 40, 50, 60, 70, 80];
  const WINDOWS = [3, 5, 7];

  for (const w of WINDOWS) {
    for (const eqP1 of STEPS) {
      const dbP1 = Math.min(90 - eqP1, 80); // keep 10% minimum in Alts
      for (const eqP2 of STEPS) {
        if (eqP2 > eqP1) continue; // must glide down
        const dbP2 = Math.min(90 - eqP2, 80);
        for (const eqP3 of STEPS) {
          if (eqP3 > eqP2) continue; // must glide down further
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

          // Select:
          // 1. Better solvency age
          // 2. Tie-break: if same solvency, prefer lower lifetime tax outgo
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
