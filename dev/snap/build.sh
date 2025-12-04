#!/bin/bash

jq '.build.executableName="notionelectron"' <<<$(<package.json) > package.json
jq '.build.linux.target="snap"' <<<$(<package.json) > package.json

npm run pack

jq '.build.executableName="notion-electron"' <<<$(<package.json) > package.json
jq '.build.linux.target=["rpm","deb","AppImage"]' <<<$(<package.json) > package.json
