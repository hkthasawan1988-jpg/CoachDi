@echo off
start msedge "%~dp0index.html"
if errorlevel 1 start chrome "%~dp0index.html"
