<!-- markdownlint-disable --><!-- textlint-disable -->

# 📓 Changelog

All notable changes to this project will be documented in this file. See
[Conventional Commits](https://conventionalcommits.org) for commit guidelines.

## [3.0.2](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v3.0.1...v3.0.2) (2023-04-09)

### Bug Fixes

- revert package.json and utils.js [#882](https://github.com/scroll-into-view/compute-scroll-into-view/issues/882) ([#891](https://github.com/scroll-into-view/compute-scroll-into-view/issues/891)) ([1d57298](https://github.com/scroll-into-view/compute-scroll-into-view/commit/1d572980b5451eca90a4510e1864265fad65708f))

## [3.0.1](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v3.0.0...v3.0.1) (2023-04-08)

### Bug Fixes

- support `—moduleResolution node16` ([#882](https://github.com/scroll-into-view/compute-scroll-into-view/issues/882)) ([d4ad5e1](https://github.com/scroll-into-view/compute-scroll-into-view/commit/d4ad5e1b53dcb0b1baa7fd6f696d467759c17cbc))

## [3.0.0](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v2.0.4...v3.0.0) (2023-02-14)

### ⚠ BREAKING CHANGES

- **refactor:** use `import {compute}` instead of `import compute`

### Features

- **refactor:** use named export instead of default ([8509530](https://github.com/scroll-into-view/compute-scroll-into-view/commit/850953006334264cf2ef9040bf8c4d7ae6700604))

### Bug Fixes

- drop `pageXOffset` and `pageYOffset` ([fc7bd97](https://github.com/scroll-into-view/compute-scroll-into-view/commit/fc7bd976d34f497da462d02772858eae718a75b2))

## [2.0.4](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v2.0.3...v2.0.4) (2023-01-08)

### Bug Fixes

- **deps:** update dependency @sanity/pkg-utils to v2 ([#860](https://github.com/scroll-into-view/compute-scroll-into-view/issues/860)) ([7804e3d](https://github.com/scroll-into-view/compute-scroll-into-view/commit/7804e3dd13f8b82e82e560f1e28e3041bb1c5df4))

## [2.0.3](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v2.0.2...v2.0.3) (2022-12-18)

### Bug Fixes

- **deps:** update devdependencies (non-major) ([#857](https://github.com/scroll-into-view/compute-scroll-into-view/issues/857)) ([d61db89](https://github.com/scroll-into-view/compute-scroll-into-view/commit/d61db8929370192d6d63d174381ae77bedec5fdd))

## [2.0.2](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v2.0.1...v2.0.2) (2022-12-01)

### Bug Fixes

- improve typings, reduce bundlesize ([0246e86](https://github.com/scroll-into-view/compute-scroll-into-view/commit/0246e86d9a4a0aaf37451db197145de6d2be34a2))

## [2.0.1](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v2.0.0...v2.0.1) (2022-12-01)

### Bug Fixes

- **docs:** update size badges ([8d6170d](https://github.com/scroll-into-view/compute-scroll-into-view/commit/8d6170dde25e6753e8ee611eb2a7c2eca027de43))

## [2.0.0](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v1.0.20...v2.0.0) (2022-12-01)

### ⚠ BREAKING CHANGES

- drops umd builds, and ships more modern syntax with ESM as baseline

### Bug Fixes

- update build tooling ([5960c1f](https://github.com/scroll-into-view/compute-scroll-into-view/commit/5960c1f4cfcddd1b1651438d73701d0a572f561c))
- use `typeof document` check for env detection ([ae9ebbd](https://github.com/scroll-into-view/compute-scroll-into-view/commit/ae9ebbddc1f4d3e815a82adbfc8e7c2f31c5f778))

## [1.0.20](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v1.0.19...v1.0.20) (2022-11-29)

### Bug Fixes

- support of shadow DOM ([#829](https://github.com/scroll-into-view/compute-scroll-into-view/issues/829)) ([9b21d76](https://github.com/scroll-into-view/compute-scroll-into-view/commit/9b21d760744b5474bcb0f22f09dcb800296fbc4b))

## [1.0.19](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v1.0.18...v1.0.19) (2022-11-29)

### Bug Fixes

- microbundle isn't exporting `.cjs` ([bef7bb2](https://github.com/scroll-into-view/compute-scroll-into-view/commit/bef7bb2d1c48dbf5ef2ece976acf8c33ee9d12f1))

## [1.0.18](https://github.com/scroll-into-view/compute-scroll-into-view/compare/v1.0.17...v1.0.18) (2022-11-29)

### Bug Fixes

- **#833:** ship `pkg.exports` ([5c09a37](https://github.com/scroll-into-view/compute-scroll-into-view/commit/5c09a377025860912bdca9097713d3c62d80880f)), closes [#833](https://github.com/scroll-into-view/compute-scroll-into-view/issues/833)
- correct scroll distance when frame in a scaled box ([#705](https://github.com/scroll-into-view/compute-scroll-into-view/issues/705)) ([c99d96a](https://github.com/scroll-into-view/compute-scroll-into-view/commit/c99d96a061d27aaf5c90e5871a9f3e3f15cf3bd5))
- moved repo to `scroll-into-view` org ([e2de468](https://github.com/scroll-into-view/compute-scroll-into-view/commit/e2de4688f21b049c4fd75d8bf85743ed217e9f51))
