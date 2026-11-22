# Custom cover backgrounds

The game includes two cover images in `manifest.json`. The title screen, hub,
and team select rotate between them. To add another cover, place a wide image
in this folder and add its filename to the manifest:

```json
{ "covers": ["cover-1.jpg", "cover-2.jpg", "cover-3.jpg"] }
```

When this manifest exists, the title screen, hub, and team select use these
images instead of the generated covers.

The two listed cover files and the manifest are tracked by git. Other images
added to this folder stay local by default. Only commit images you have the
rights to publish.
