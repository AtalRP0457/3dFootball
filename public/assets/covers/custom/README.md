# Custom cover backgrounds (optional, local only)

Drop wide images (16:9, 1920x1080 or larger) in this folder and list them in
`manifest.json`:

```json
{ "covers": ["cover-1.jpg", "cover-2.jpg", "cover-3.jpg"] }
```

When this manifest exists, the title screen, the hub and team select rotate
through these images instead of the generated covers.

Everything in this folder except this README is ignored by git, so images you
add stay on your machine. Only commit images you have the rights to publish.
