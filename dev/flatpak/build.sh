#!/bin/bash

cd ./dev/flatpak

flatpak-node-generator npm ../../package-lock.json
rm -rf .flatpak-builder/build
flatpak-builder build io.github.anechunaev.notion-electron.yaml --install-deps-from=flathub --force-clean --user --install
