name: Saphahemailservices Automation

on:
  workflow_dispatch:
  schedule:
    - cron: "0 * * * *"     # Every hour (UTC)

jobs:
  email-job:
    runs-on: ubuntu-latest

    steps:
      # -------------------------------------------------------------
      # STEP 1 – CHECKOUT REPOSITORY
      # -------------------------------------------------------------
      - name: Checkout repository
        uses: actions/checkout@v4

      # -------------------------------------------------------------
      # STEP 2 – SETUP NODE.JS ENVIRONMENT
      # -------------------------------------------------------------
      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      # -------------------------------------------------------------
      # STEP 3 – INSTALL DEPENDENCIES
      # -------------------------------------------------------------
      - name: Install dependencies
        run: |
          npm ci || npm install

      # -------------------------------------------------------------
      # STEP 4 – ENSURE DIRECTORIES EXIST
      # -------------------------------------------------------------
      - name: Ensure directories exist
        run: |
          mkdir -p LOGS SENT SCHEDULE

      # -------------------------------------------------------------
      # STEP 5 – WEEKEND PAUSE CHECK
      # -------------------------------------------------------------
      - name: Check for weekend pause
        run: |
          LOGFILE="LOGS/email_status.log"
          DAY=$(date -u +%u)
          HOUR=$(date -u +%H)
          NOW=$(date -u '+%Y-%m-%d %H:%M:%S UTC')

          # Pause from Friday 15:00 UTC through Monday 06:00 UTC
          if { [ "$DAY" -eq 5 ] && [ "$HOUR" -ge 15 ]; } || \
             [ "$DAY" -eq 6 ] || \
             { [ "$DAY" -eq 7 ] && [ "$HOUR" -lt 6 ]; }; then
            echo "$NOW — CLOSED FOR WEEKEND — emails paused." | tee -a "$LOGFILE"
            exit 0
          else
            echo "$NOW — Normal weekday run — continuing." | tee -a "$LOGFILE"
          fi

      # -------------------------------------------------------------
      # STEP 6 – RUN EMAIL SERVICE
      # -------------------------------------------------------------
      - name: Run Gmail email service
        env:
          GMAIL_USER: ${{ secrets.GMAIL_USER }}
          GMAIL_CLIENT_ID: ${{ secrets.GMAIL_CLIENT_ID }}
          GMAIL_CLIENT_SECRET: ${{ secrets.GMAIL_CLIENT_SECRET }}
          GMAIL_REFRESH_TOKEN: ${{ secrets.GMAIL_REFRESH_TOKEN }}
          EMAILFIREBASEADMIN: ${{ secrets.EMAILFIREBASEADMIN }}
        run: node email-send.js

      # -------------------------------------------------------------
      # STEP 7 – COMMIT SENT EMAILS AND LOGS
      # -------------------------------------------------------------
      - name: Commit sent emails + logs
        run: |
          git config --local user.name "GitHub Action"
          git config --local user.email "actions@github.com"
          git add SENT LOGS || true
          git commit -m "Update sent emails and logs [ci skip]" || echo "No changes to commit"
          git push origin main || true

      # -------------------------------------------------------------
      # STEP 8 – SEND DAILY SUMMARY (UTC 22:00)
      # -------------------------------------------------------------
      - name: Send daily summary
        run: |
          HOUR=$(date -u +%H)
          SUMMARY="LOGS/email_status.log"

          if [ "$HOUR" != "22" ]; then
            echo "Not daily summary hour. Exit."
            exit 0
          fi

          if [ -f "$SUMMARY" ]; then
            SUBJECT="Daily Email Summary $(date -u +%Y-%m-%d)"
            BODY="$(cat "$SUMMARY")"
            RECIPIENT="${{ secrets.GMAIL_USER }}"
            echo "Sending daily summary to $RECIPIENT..."
            SUBJECT="$SUBJECT" BODY="$BODY" RECIPIENT="$RECIPIENT" node email-send.js
          else
            echo "No log found. Skipping summary."
          fi
