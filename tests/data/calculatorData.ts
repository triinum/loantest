export type HappyCase = {
  name: string;
  amount: number;
  period: number;
};

export type NonHappyCase = {
  name: string;
  field: 'amount' | 'period';
  value: string;
  counterpart: number;
};

export const HAPPY_CASES: HappyCase[] = [
  { name: 'minimum boundary 500€/6 months', amount: 500, period: 6 },
  { name: 'mid-range 15000€/60 months', amount: 15000, period: 60 },
  { name: 'maximum boundary 30000€/120 months', amount: 30000, period: 120 },
];

export const NON_HAPPY_CASES: NonHappyCase[] = [
  { name: 'negative amount', field: 'amount', value: '-500', counterpart: 60 },
  { name: 'negative period', field: 'period', value: '-6', counterpart: 5000 },
  { name: 'floating point amount', field: 'amount', value: '500.50', counterpart: 60 },
  { name: 'floating point period', field: 'period', value: '12.5', counterpart: 5000 },
  { name: 'amount with accidental spaces', field: 'amount', value: ' 5000 ', counterpart: 60 },
  { name: 'period with accidental spaces', field: 'period', value: ' 60 ', counterpart: 5000 },
  { name: 'emoji amount', field: 'amount', value: '💸', counterpart: 60 },
  { name: 'emoji period', field: 'period', value: '🗓️', counterpart: 5000 },
  { name: 'alphabetic amount', field: 'amount', value: 'SadaEurot', counterpart: 60 },
  { name: 'alphabetic period', field: 'period', value: 'Kuuskümmend', counterpart: 5000 },
  { name: 'special character amount', field: 'amount', value: '5000€', counterpart: 60 },
  { name: 'special character period', field: 'period', value: '60#', counterpart: 5000 },
  { name: 'empty amount', field: 'amount', value: '', counterpart: 60 },
  { name: 'empty period', field: 'period', value: '', counterpart: 5000 },
];
