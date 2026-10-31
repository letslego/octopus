# Octopus Eval Kernel

`@letslego/octopus-eval-kernel` is the workspace-private, provider-neutral
matrix orchestrator owned by Octopus Evals. It contains no Octopus scenario
corpus, provider configuration, product fixture, scorer, or report template.

Consumers pass scenario and candidate values plus execution and scoring
callbacks. Candidate `preflight` hooks should call the runner package's
`assertPaperclipRunnerCompatibility` before any provider work starts. This keeps
catalog, protocol, runner-client, control-plane-adapter, testkit, corpus, and
provider-operation incompatibilities explicit.

Octopus App may consume this package only as a development dependency for CI
or parity tests. `@letslego/octopus-runner` has no runtime dependency on it.
