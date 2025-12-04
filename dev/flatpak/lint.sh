#!/bin/bash

cd ./dev/flatpak

flatpak run --command=flatpak-builder-lint org.flatpak.Builder manifest io.github.anechunaev.notion-electron.yaml
appstreamcli validate --explain io.github.anechunaev.notion-electron.metainfo.xml
