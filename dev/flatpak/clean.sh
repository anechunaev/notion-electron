#!/bin/bash

flatpak uninstall --delete-data io.github.anechunaev.notion-electron || true
rm -rf dev/flatpak/.flatpak-builder
rm -rf dev/flatpak/build
