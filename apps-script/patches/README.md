# Pending production function replacements

These patches are based on the captured `PassKiosk_Code_secure.gs` from 2026-10-02. They are **not installed or deployed**. Compare the live functions before replacing them and preserve any newer changes. Do not upload these files alongside existing functions with the same names.

## Detention zero-window rule

Replace only `buildDetentionAvailability_` in Code.gs with the function in `DetentionAvailability.gs`.

For window 0, automatic suggestions consider the next three eligible active school days, skipping capacity-full dates and dates already assigned to that student. Lowest assignment count wins; earliest date breaks ties. If fewer than three dates exist, use the available eligible dates. Positive window values retain their existing behavior. Manual date validation is not changed by this patch.

## Explicit Excused persistence

1. Add an exact `Excused` header to Transactions, after the existing columns. Do not rewrite historical rows or infer their values.
2. Replace `buildTransaction_` and `buildPassTx_` with the functions in `PassExcused.gs`.
3. Add its new `assertPassExcusedHeader_` helper once.
4. Save and verify in the editor against the live Code.gs dependencies.
5. Update the existing secure deployment, preserving its access and identity settings.
6. Verify one explicit true and one false PASS transaction. Also verify false when no value is supplied; confirm Reason(s) does not determine Excused.
7. Verify a bulk PASS saves the boolean for each created transaction and preserves the existing per-student failures.
8. Only then enable `explicitExcused` and bump the client/cache versions.

The base transaction defaults Excused to false. PASS stores only `data.excused === true`; truthy strings and numbers do not become true. The header assertion rejects PASS creation when the schema is missing so the value cannot silently disappear in `appendMappedRows_`.

Activity Bus continues to use its separate transaction builder. These patches do not modify print jobs, authentication, or Activity Bus activation.

## Verification

Run `node tests/backend-migrations.test.cjs` for deterministic tests of these replacement functions. These synthetic checks do not prove the bound project has been updated. Complete non-printing live backend checks before enabling any client feature.
