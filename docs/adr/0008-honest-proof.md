# 8. Honest proof: pre-registration, disclosed raters, published losses

Date: 2026-10-31. Status: accepted.

## Context
The idea that Qloo's taste graph helps pick and win cities is easy to assert and easy to flatter. Judges and
managers should be able to see what was tested, what lost, and how much to trust each number. Raw Qloo results
cannot be published (ADR 0003), so the method has to carry the trust.

## Decision
- The protocol (`docs/qloo/proof-v3-protocol.md`) was committed before any Qloo or Gemini call. Each of its 10
  dated amendments was committed before the call it affected. The commit history is the record.
- The claim rule is fixed in code: "X beat Y" is printed only if the mean is higher and a two-sided exact sign test
  gives p < 0.05. Otherwise the text says "Not significant at this sample size", names the losses and states the
  chance level.
- Losses are published in the same place as wins. Test A (city ranking) and Test C (names exist in the city) are
  losses for Qloo and shipped as such. The product changed because of them: it leads with winning each city rather
  than choosing cities (ADR 0002), and the local-acts card is renamed "Acts these fans love here".
- Raters are disclosed. In Test C, 148 of 182 rows were rated by blinded AI agents, and the author rated 34 and
  agreed with the agents on 82%. Test B's post-cutoff cases (Amendment 9) were collected and verified by AI agents.
  The page says both.
- Checkers are tested with planted errors and clean controls from fixed generators, run offline (Amendment 10).
  False alarms are reported next to catches.
- Only aggregates are published. Raw results and Qloo entity names stay in `private-data/`.
- `/proof` leads with an "At a glance" scoreboard computed from the published sign tests and checker counts, so the
  headline cannot drift from the data.

## Consequences
- The headline numbers are modest and in places unfavourable. That is the intended trade.
- Samples are small (10 artists, 22 cases, 8 post-cutoff cases). Significance tests on them show direction, not
  size. Generic LLMs did better than Qloo at some tasks, and the page says where.
- Checker rates come from synthetic fixtures and, for the sponsor check, a fixed fake classifier output. They bound
  what the rule can do, not how the live model behaves.
- Anyone changing a runner must read all amendments first. A change that touches a test needs a new amendment.
