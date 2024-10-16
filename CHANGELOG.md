# CHANGELOG for `@bsv/overlay`

All notable changes to this project will be documented in this file. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## Table of Contents

- [Unreleased](#unreleased)
- [1.0.0 - YYYY-MM-DD](#100---yyyy-mm-dd)

## [Unreleased]

### Added
- Added a spent parameter to the `markUTXOAsSpent` method of the Storage interface and KnexStorage class to capture the txid of the spending transaction.

### Changed
- Changed the spent parameter in the Output record to be a string representing the txid of the spending transaction.
- Changed the return type LookupAnswer to include the spend status of an output.

---

## [1.0.0] - YYYY-MM-DD

### Added
- Initial release of the BSV Blockchain Overlay Services Engine.

---

### Template for New Releases:

Replace `X.X.X` with the new version number and `YYYY-MM-DD` with the release date:

```
## [X.X.X] - YYYY-MM-DD

### Added
- 

### Changed
- 

### Deprecated
- 

### Removed
- 

### Fixed
- 

### Security
- 
```

Use this template as the starting point for each new version. Always update the "Unreleased" section with changes as they're implemented, and then move them under the new version header when that version is released.