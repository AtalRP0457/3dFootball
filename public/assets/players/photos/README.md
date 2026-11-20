# Player photos (optional, local only)

Drop cut-out player images (PNG with a transparent background works best,
portrait, feet or waist at the bottom) in this folder and list them in
`manifest.json`, keyed by player id:

```json
{ "lionel-messi": "messi.png", "cristiano-ronaldo": "ronaldo.png" }
```

Player ids are shown in the in-game Player Database. When a player has no photo
the game draws its own painted figure in the team's kit.

Everything in this folder except this README is ignored by git, so photos you
add stay on your machine. Only commit images you have the rights to publish.
