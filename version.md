# 0.1.24

- fix: bump qs to patch advisories and drop unnecessary type assertions (bb577d8)

# 0.1.23

- feat: support video thumbnails in image-cluster galleries + lightbox (#8) (29b469a)
- fix: avoid unsafe innerHTML assignment for video play badge icon (61bb2e9)

# 0.1.22

- feat: durable publish ledger to recover "ghost pages" (#7) (d67de11)
- feat: render Dataview query blocks as static content in exported HTML (cacfef3)
- feat: render inline ```base code blocks on exported pages (#5) (df4dd80)
- feat: add hover "stop sharing" action to the currently-sharing list (#3) (8d6ee47)
- fix: use toast notices for stats actions (#6) (4e394a2)
- fix: drop undefined query keys in OSS listObjects to fix V4 signature error (#4) (0fc67a0)
- fix: lint pass — type catch variable, fix floating promises, pin urllib (badde05)

# 0.1.21

- feat: allow zooming and swiping between images on exported pages (0141f4e)
- fix: address lightbox correctness issues found in code review (8178df2)

# 0.1.20

- fix: never auto-publish a never-shared sub-note from the update button (50ce956)
