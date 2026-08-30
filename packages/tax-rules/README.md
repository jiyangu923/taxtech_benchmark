# `@taxbrains/tax-rules`

Effective-dated, source-linked tax-rule primitives. Rates are rational numbers parsed from percentage strings, and applying a rate requires an explicit rounding policy.

This package intentionally contains no hardcoded jurisdiction rates. A rule may be used only after it has been loaded from the canonical rule registry and re-verified against its authority source.
