#!/usr/bin/env bun

const env = {
  ...Object.fromEntries(Object.entries(Bun.env).filter((entry): entry is [string, string] => entry[1] !== undefined)),
  OPENCODE_CHANNEL: Bun.env.OPENCODE_CHANNEL ?? "prod",
  OPENCODE_DESKTOP_TARGET_PLATFORM: "win32",
  OPENCODE_DESKTOP_TARGET_ARCH: "x64",
}

console.log("Building experimental Win7 desktop assets for win32/x64")

process.exit(
  await Bun.spawn({
    cmd: [process.execPath, "run", "build"],
    env,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  }).exited,
)
