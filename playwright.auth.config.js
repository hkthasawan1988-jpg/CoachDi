const {defineConfig}=require('@playwright/test');
const base=require('./playwright.config');
module.exports=defineConfig({...base,testDir:'./tests-auth',timeout:90000,workers:1,fullyParallel:false,
  outputDir:'auth-test-results',reporter:[['list'],['html',{open:'never',outputFolder:'auth-test-report'}]]});
