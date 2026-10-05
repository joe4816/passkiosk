# Scanner camera selection

Every new scanner opening requests the outward-facing/back camera. If the browser reports that no such camera exists, PassKiosk falls back to its available camera. After permission is granted, rear/back camera labels can correct browsers that ignore facing-mode constraints.

The scanner's Camera dropdown lists available video-input devices, excluding microphones. Choosing one stops the previous stream and requests the chosen camera by its exact device ID. On a single-camera device the dropdown is disabled. Device labels and availability depend on browser permissions; restricted enumeration does not prevent an otherwise working scanner.

Camera choice is not saved as a new default. Closing and reopening the scanner prefers the back camera again. No device IDs are sent to the backend or published in configuration.

Switching cameras preserves held-QR suppression so switching lenses alone cannot trigger a deliberate Activity Bus duplicate override. Student/countdown resets do not cancel camera startup; closing the scanner or changing lanes does. Failed switches leave camera selection available for recovery.

Synthetic regression tests: `node tests/camera-choice.test.cjs`. Device-level validation remains needed for the target browser/camera hardware; these checks do not constitute physical device proof.
