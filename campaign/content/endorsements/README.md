# Endorsements — permission required

This folder is empty on purpose.

To publish an endorsement:

1. Get **written** permission from the endorser. Email is fine. It must say, in
   their words, that the campaign may publish their name, their title, and their
   quote on the campaign website.
2. Save it as `content/endorsements/<id>.permission.md` with the sender, the date,
   and the full text.
3. Add the matching entry to `content/endorsements.json` using the same `<id>`.
4. Run `npm test`. The endorsement test fails if an entry has no permission file,
   so it is not possible to ship an unpermitted name by accident.

Until step 3 happens, `/endorsements` renders an honest empty state that invites
neighbors to send one. That page is not a failure. A wall of logos nobody agreed to
is the failure.
