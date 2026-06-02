Welcome to Biblios. I played this game in China and didn't find any online version so I built it here. If you enjoy strategy games like Catan, I think this game will suit you.



ToDo

1. Migrate everything from client-side to server side.
~~2. Secure logins //~~~ Done 8/26 with cookies and sessions verifying logins
3. Cards drawing twice as fast for [specifically] 2 players --> Actually maybe this is fine -- Otherwise the game takes too long?
4. Chat does not store broadcast messages if the chat is closed.
5. Rejoin Game Bugs

Less Urgent ToDo:

1. Clearer Login Page
2. Home screen UI
3. Modifiable chat size
4. Settings page in the game
5. Spectator Mode?

Cool to implement:
1. Settings page
2. Friends list
3. Interactive results-page
4. Accessability to phone/other devices
5. Spectator Mode
6. Replay System

## Rules 

Objective:
There are 5 categories for dice. The objective is to win as many dice points as possible.
The way to win a dice point is to have more points in that category than everyone else. Eg: If you have a religion 2 and a religion 3, you have 5 total religion.

Gameplay (pt1 --Drawing Cards)

Players will take turns. During someone's turn, everyone else waits.
If it is your turn, you will draw cards equal to # of players + 1. Draw cards individually.

With each card, you may choose to Keep, Discard, or Pool it. If you keep the card, you add it to your hand. If you discard it, it goes to the discard pile. If you pool it, it goes into the shared pool.
You may only keep and discard one time, and all remaining cards have to be pooled.

(pt2 --Pooled)
After your turn, the other players will be able to take the pooled cards. If you are index 1, The next player in index 2gets to pick first, and so on until everyone gets a card. 

Then it is the next player's turn [Player in index 2] to draw cards

(pt3) Auction/Discard 
After the deck is done being drawn, players auction on the discarded cards. Players who pass may not re-enter the bid until the next card shows up.

When a non-gold card is shown, you bid with gold coins. 
When a gold-card is shown, you bid with # of cards to discard. Eg: bidding 3 on a gold card means you are willing to discard 3 seperate cards

(pt4) Scoring
There is no game-influencing events, but everyone adds up their cards from each section and the winner is determined

Misc.
1. Tiebreakers in dice-points is determined off gold.
2. Tiebreakers in category will be split evenly
3. There are no refunds in Auctioning. If you only have a gold 3 card and win the bid for only 2, you must spend all 3 gold. 

Changes:
9/10 --> Hosted on different website. [Need to optimize SEO for this website now]



