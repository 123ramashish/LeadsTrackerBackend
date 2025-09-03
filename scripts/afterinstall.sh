#!/bin/bash

# Navigate to the application directory
cd /home/intertech/taskify-backend-main

# Restart the PM2 process
pm2 restart public/src --name intertech-backend

# List all PM2 processes to confirm restart
pm2 list
