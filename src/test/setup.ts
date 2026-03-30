// Test setup file for mocha + chai + fast-check
import * as chai from "chai";

// Configure chai
chai.config.truncateThreshold = 0;

export { expect } from "chai";
export { default as fc } from "fast-check";
