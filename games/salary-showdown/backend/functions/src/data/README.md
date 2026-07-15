# NEVER expose hidden.json or engine_params.json to clients
These ship inside the Cloud Functions deployment only. They are the answer key.
`players.json` is the public catalog (mirrors the pre-released players.csv).
