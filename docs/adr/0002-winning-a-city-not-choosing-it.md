# 2. Winning a city, not choosing it

Date: 2026-10-28. Status: accepted. Supersedes the 2026-10-17 framing "winnability finds the cities density misses".

## Context
The first story was that ranking by winnability (0.5 x fan heat + 0.5 x activation) picks better cities than
fan density alone. We pre-registered a test of that claim before any Qloo or Gemini call
([Proof v3, Test A](../qloo/proof-v3-protocol.md)): for 10 artists (of a planned 12), how well does each method
rank the cities the tour actually played? The generic LLM beat winnability (p=0.031): mean R-precision 0.82 vs
0.66, 0 wins, 6 losses, 4 ties over 10 artists. Fan heat scored 0.68, population 0.79, chance 0.62.
Winnability against fan heat was not significant (1 win, 1 loss, 8 ties). Separately (Test B), Qloo rank did
beat popularity at picking the real activation among 10 candidates (p<0.001) but not Gemini (p=0.118).

## Decision
We do not claim winnability ranks cities better, and we never will without a new pre-registered test that says
so. The product leads with winning each city: sponsors and local guests ranked by Qloo taste, brands shown by
rank lift over the city, real venues, smaller support acts, verified claims, verdict clocks and a Tour Book.
Routing tools, or an LLM, are fine for choosing cities. Where fan heat and winnability disagree is shown as
"worth a second look", not as a ranking claim. No "hidden goldmine" promise.

## Consequences
- Landing, judge path, `/proof` and the README tell the same story, with the loss stated beside the wins.
- The Tour Board stays (it is where the playbooks start) but is framed as a first look, not an answer.
- Our evidence for the playbook layer is Test B, Test C (grounding) and the claim-checker catch rate.
- Samples are small and Qloo data is current, not as of the tour date; the results can change with more data.
