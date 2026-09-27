# Changelog file URLs for additional Git providers

The changelog file URL helper returns null for Gitea, Bitbucket, SourceHut, and Gitee repositories. Extend `getBaseFileUrl` in `server/utils/changelog/baseFileUrl.ts` so callers receive both raw-file and browser-file base URLs for HEAD on those providers.

Preserve the existing RepoRef input and RepoFileUrl-or-null return API. Gitea supports custom hosts and defaults to gitea.com when the host is absent. Bitbucket uses bitbucket.org, SourceHut uses git.sr.ht (preserving the owner's leading tilde), and Gitee uses gitee.com. Match each provider's raw and browsable file URL conventions. Preserve all already-supported providers and null for unsupported ones.

This task is scoped to the URL helper, not the full provider integration. Application dependencies are intentionally not installed. You can exercise the actual TypeScript helper with Node's --experimental-strip-types flag; the named global input type is erased at runtime. Do not edit unrelated integration code or dependency files.
