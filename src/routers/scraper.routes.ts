import express from "express";
import { scrapeGoogleMaps } from "../controller/scraper.controller";

const scrapperrouter = express.Router();

// GET API
scrapperrouter.post("/scrape", scrapeGoogleMaps);

export default scrapperrouter;