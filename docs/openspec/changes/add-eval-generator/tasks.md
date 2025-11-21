# Tasks: Add Eval Generator

- [ ] **Create Templates**: Add `generator.prompt.md` and `adversarial-judge.md` to `apps/cli/src/templates/`. <!-- id: create-templates -->
- [ ] **Implement CLI Command**: Create `apps/cli/src/commands/generate/index.ts` and register it in `cli.ts`. <!-- id: implement-command -->
- [ ] **Implement Generator Logic**: Write the logic to invoke the LLM with the generator prompt and parse the response. <!-- id: implement-logic -->
- [ ] **Implement YAML Writer**: Ensure the output is written to a valid YAML file. <!-- id: implement-writer -->
- [ ] **Add Init Support**: Update `agentv init` to copy the `adversarial-judge.md` template to the user's project. <!-- id: update-init -->
- [ ] **Test Generation**: Verify that `agentv generate` produces valid YAML that can be run with `agentv eval`. <!-- id: test-generation -->
