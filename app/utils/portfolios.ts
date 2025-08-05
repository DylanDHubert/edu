// CLIENT-SIDE SAFE PORTFOLIO CONFIGURATIONS
// THIS FILE CAN BE IMPORTED ON THE CLIENT SIDE

export const PORTFOLIOS = {
  hip: {
    name: 'HIP PORTFOLIO',
    description: ' SURGICAL TECHNIQUES AND PROTOCOLS',
  },
  knee: {
    name: 'KNEE PORTFOLIO',
    description: 'SURGICAL TECHNIQUES AND PROTOCOLS',
  },
  ts_knee: {
    name: 'TS KNEE PORTFOLIO',
    description: 'SURGICAL TECHNIQUES AND PROTOCOLS',
  }
} as const;

export type PortfolioType = keyof typeof PORTFOLIOS; 