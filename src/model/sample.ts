/** Two sample trees, written as generic markdown so they also exercise the parser. */

export interface SampleTree {
  id: string;
  name: string;
  description: string;
  markdown: string;
}

export const SAMPLES: SampleTree[] = [
  {
    id: "profit-decline",
    name: "Profit decline 20%",
    description: "Diagnostic tree: why did profit fall, split into revenue, cost and mix.",
    markdown: `# Why did profit fall 20% year over year?

- Why did profit fall 20% year over year?
  - Did revenue decline?
    - Did price per unit fall?
      - Did we discount more in the enterprise segment?
      - Did the list price change without a matching cost change?
    - Did volume fall?
      - Did win rate on new business fall?
      - Did churn rise in the mid-market?
  - Did cost increase?
    - Did cost of goods rise?
      - Did input prices rise?
      - Did yield or scrap worsen?
    - Did operating cost rise?
      - Did headcount grow faster than revenue?
      - Did marketing spend efficiency fall?
  - Did the product mix shift?
    - Did low-margin products grow faster than high-margin ones?
    - Did one large low-margin contract start this year?
`,
  },
  {
    id: "market-entry",
    name: "Market entry 2027",
    description: "Solution tree: how to enter a new mid-market, with stop conditions.",
    markdown: `# How should we enter the German mid-market by 2027?

- How should we enter the German mid-market by 2027?
  - Which customer segment should we target?
    - Mid-market manufacturers with 200 to 2,000 staff?
    - Service firms with a large field team?
    - Software firms that already buy adjacent tools?
  - Which route to market should we use?
    - A direct sales team in two cities?
    - Channel partners who already sell to the segment?
    - An acquisition of a local reseller?
  - What must the offer include?
    - German-language support during business hours?
    - EU data residency?
    - Integration with the two dominant ERP systems?
  - What would make us stop?
    - Payback longer than 30 months?
    - Win rate below 15% after two quarters?
`,
  },
];
