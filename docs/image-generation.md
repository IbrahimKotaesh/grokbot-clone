# Native image generation

Fino's ChatGPT/Codex adapter consumes the installed app-server's `imageGeneration` items. On start it displays a single “Generating an image” step. On completion it imports the actual generated artifact into the bot's authenticated chat image store; no Linux shell/skill lookup or `attach_file` step is needed.

The runtime keeps native shell and patch tools disabled. Host skill discovery is suppressed so the model does not try to read desktop-only imagegen skill paths inside its separate Linux computer. Native image generation uses the ChatGPT-authenticated CLI; Fino does not extract tokens or silently switch to a paid Images API key. Availability and limits still depend on the account. Read only mode disables native image generation and retains a read-only sandbox. Other modes permit workspace writes for native artifacts; computer/shell actions still use Fino's existing approval gate.

Only image bytes are imported. Saved artifacts must resolve beneath the bot workspace or the runtime's generated_images directory. Symlink escapes, external URLs, non-image files and images exceeding the existing 3 MB chat limit are rejected. Base64 artifact results are supported when no local artifact path is provided. Duplicate completion events do not duplicate chat images. Usage-limit and attachment errors are shown explicitly.

The Claude adapter does not currently have this native generation tool. Its prompt must explain the limitation and suggest selecting ChatGPT, rather than claiming an image was generated or running speculative commands. Existing image analysis and file attachment support remain available.

Validation used Codex CLI 0.169.0 on the VPS: a ChatGPT-authenticated, ephemeral app-server session generated a Di Maria portrait in 42 seconds, returning a completed native event and a valid PNG artifact. Unit checks cover native-event import, deduplication, owner isolation, usage-limit errors, unsafe paths, invalid formats and size limits.

References: [OpenAI image-generation documentation](https://learn.chatgpt.com/docs/image-generation), [version-specific app-server protocol generation](https://learn.chatgpt.com/docs/app-server).
