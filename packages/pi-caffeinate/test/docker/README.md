# pi-caffeinate D-Bus Docker smoke

This opt-in smoke runs the real `dbus-native` transport and the local pi-caffeinate source against a private `dbus-daemon`.

From the repository root, run:

```bash
npm run smoke:caffeinate-dbus
```

The smoke verifies a missing ScreenSaver service, the standard and niri object paths, D-Bus-only partial activation, cancellation and connection cleanup during an in-flight `Inhibit`, and an unreachable session-bus socket that must reject without terminating Node.

Docker does not run a Wayland compositor, so this smoke does not prove that a real desktop refrains from locking, blanking, or powering off a display.
Keep the niri, GNOME, or KDE live smoke as a separate verification step.
