# HistoryHiders and HistoryFinders

HistoryHiders and HistoryFinders are two bortherly bots that check user histories.

when you (as moderator) install HistoryHiders into your subreddit everytime a user makes a post or comment they will be evaluated,
if they are recently evaluated then they will not be evaluated for 28 days, when evaulated users post or comment they will be reported.

when they arent recently evaluated they will be evaluated. this is done by sending their recent post and comment history (ids and Dates) to a special subreddit
where HistoryFinders will check if they match. HistoryFinders will make a post with the result.

to preemptively load balance your subreddit will be on cooldown for 15 days.

## limiations

as we are in early access, expect some bugs, i want to run some live tests in feedback friday at
[r/Devvit](https://www.reddit.com/r/Devvit/) before fully saying its ready for publuc use. use at your own risk.

because of this, it only can report content on your subreddit.

## source code

[HistoryFinders's sourcecode is here](https://github.com/DNSCond/historyfinders).
[HistoryHiders's sourcecode is here](https://github.com/DNSCond/historyhiders).
