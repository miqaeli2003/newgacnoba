const socket = io();
const PRESS_COUNTER_HINT_IMG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAeoAAAA9CAYAAABiISoZAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAE7hSURBVHhe7b13mF3HdSf4qxte7pwbjUYOBEFEBjBYJMciJVPBI1kSLUqyJNsza89YTruyvTs73+z3ecdjf+vd/ez9vA5ykqxVsk2PJUqWLdmSKYoCIwiAJAiQyKEbncPLN9T+UeFW1b2v32t0QwKo/gGv761zTp1bdercOlV1E9m1ez/FaoHoO4QAoBSUcAYBiNgHoxMhSBiNiRG2J/XdJKCsyJTXAyCsSpRRCKWyUpRSUV1OB6isMGesXsus4fsJ3p5Ya8LrCq17kP3KmwSyT1gCrci8iRGFm8Zt34rMzQCy+oGaGYSIcMWDsAzIIkCTKC0FuC11m8YNvHoFvjbES8RPGs6Q/TQVheV1pJSJiYDNAzgkbS1Y3/T4Ie88fxB4s3TGEqJfSMJSPOBN7nlLt28UY+JYinczYPUCNbME3zWCNDcQBUAsRic8YIMQuFsLcNbnYPdnQDpdWCkrcjezdDJ+UT7zTg5olC7Nj+kRgXYFekSaeiHonAc6XUdwuYzgfAWgFEQJzDSM3E7OrikL02vB+iZEkwC90bYwZFH0EII2QuAS3u5LQHIpP7Vi4ozB12uSBDQ0OZxEJGboTUguhYZ8qYdJNJQD6zvqFChRYAYUV6mFiw0qIrvhm7hDbhiIDXpXzwNo67oDmfx2pDJDsKycKpxgY0OrNpsw21zlC6pC11yN59foqjbep8XaLCqXUkwlr9DLmjPKz7ZBUIZfu4pa5QxKC0exMHeY80UoivtAI/rNgNUJ1MwCfDcpSHNrEwIQvm8TZA52w93bBStnxxvSTLbA1wKqZBjJZnrUwK0zWuLLpOK4tBIieHUB/vF5IKTM+yibUTMP5foo80yWTThUtES+hhsU3BfMZrIIwW02sNMmSCfwTZguxXJovaKkJsIQbygnkVxuU49KXgoRnyuIVwhoQY8APzWUDIxQB/A6gNeohdA4huyGb8YOOSlIqzRiY3DkI+gZfA9sp10I6Fu5UTWpfQjbiR3JCISRuOjHIjprEnGgeD4mfo2Bm1IemHV6xDeOz7eBt4j5mX/E1NjjAEIA0QRRBWEMk3zDY+WBOjozlg7SFhe2AHdjDpm3DMDqTEV6RLsvFQi1Tkju6GjG54gFdlPuOuihCx68Z6YRXqqxgA1EgVsJ1voyeAO9SSA2HKcdlp2DZWVALKe1fD8sIAANfYRhFWFQhu8vADQwpZYHpQNTMWIT3GlbKJCIY8o0QjxASY7CSBiUGtD6yiWglzAhxzJcEEvJGed0QzmOWGkMQgkERygwZiiKuqSbqENuEqTbu+/Buk2/gFR6WPLAZ5p6i4nGYtvIZEJC8NmfGJ/TBbTAGmsMM5+6Ex2f7RjH5/uRr+t0uZeYL5I3rVavj2Pq8mdQnH8REL5g+EES7UbHKgVqfs1Z3DiWFKQ5Pb23E5n7B5oGOOYgDQK2mjT1SIbYtK5HJ+idQqNyNj2OgCLnPzOD4MQio1HKBoDcY7VgTQj3xwbHVuCmeuGkekCDKsLQA6V1hLQeDQjWAFgEFkmBkBQsywWxM/Dr0/DqU6Zka1A6QxW3OhYO2lHa5MfAfS3uOpzBNcTYJpq7iYbEc0bv9SW5FUg57rtmhZavxyxPsj2OUQunDOWyG74ZOuQmQbp/+AMY3PDzRtPwPSoCtrCMkBB8sUmg8z5b53OmTCbxo3xmW5j0iKzPzBVOxE+gN+Ur9VfpU1c+i9nJrwENAnMS7UaG3dc/9L+ZxJbBast3lw7SxALSe7uRub+fyQtZ/g9EPbsYXWzV/Zgc16PmUbEcPWKpRPIViPwEkRxngInzvIqeJBAQ2CM50FoITNdEZq6IannZZMwoqAHLSiOVWQfbzsOrTyPwS6BhHZQG5rmyBgpQGoCGdYRBBSGtwXE6YTttoGGV2axVNA3Seps1bkGFGWtqnRH9bQCen/BfM0TnhMjIqFo54qdKc4iDqwXhT3i0okfKKWVIIoi/A4TCB8G01BBJsZ1WjvoDQgtBemjjf+D9HK+zWh0S2SKxrThB0BuY0uAn+YDuLeaOzCubXO9DZTfdwDcNV4lB7581RnR8kR9Arm0PaFhBtfx6lMdQnES7UbEqgVpd8mZ2I+zObos7lwXYG/LIvW1IZo2NkMykOVNO4pOEGayZbKan0UzYTLbCJ3F6dFj9ONa6LMLJOlD02fVqQkA1JxTOpziS4VMsSI8A1Ifnzax8GfeHDTRAGJZhWWk4bhfCoLysYG029YhNcK8TNZLJN2G6FMshnChyppiYgC7WWE6CZYiFBkOPSl4KEZ8riFcIaEGPgJSLZdALGGMDGCAUsyAoGvSbqTMGoAXp9u57sH7Lb3DTCqpa+2jmmzgjJkxfnB/RYzaV/ZguH/WfxnHEntb/xWVi/ac8rlha1+lRPtZ8sfpTAIQ/RaOWTzApC9a1yll4tXEgwRfM9I0MyyS0DFbLqJ5EjMJ4wJHPSAPUIsi+hc2ko+z6PxNNZ9xydBXll3pMOUlO0KPkjelRkDjjNo6j/osY7Cd1K3rcO7vYKoTFuESxHQgYTzpovExuegBhWIPvzcdOrDW0CErhe3OgYQ1uesDkJiNhFmQBuNNZ3ulE1NkFkX+MLfeNhPY3xLgPGTIauA9qPhqdH0KPIrokInEuLCqkVUxXuxSkXKwcegGjvzr2ERrr0Ci0KHBjIcGPZJpYWLfpFyLTcvOKfbnHbaWbLN6mRosrGZiskdQVmuKSHgnIbpbwhAHW74mEQucJw2Uk1DprbH4wwhk6PyL0rfuI5CTa+kb1DQPXNqOWFiH6bNoigFi+tdg1QUIIMrd3w9lS0FSYVjNnnApDTybx2WF5cgV6tKRUaDL4psFxOJrN5EEBpG2QkIJO1DibjS6jLYM2q+ZwU72w7Tx8b8ZkreEaENI6bKcNhNgIg7LJboo9DsEojxJmU8fAfTbuOpwhvaEJGrhWI8TDAodBbiAVQySXXKFl69GrbxASVgIMpLjkpHb28O4q4Ry64aDMGgfXfwwdXfcZNuYyCddkI77YJNBJkxm4FFT4VDSBri8SN44jyUkz82hf7zfj+/F+VZTHOL5KN+IAAFh2DoQAleKrPF7pvmCmb1SYA9BrgxxO8VmgWPImjJfa0yVnknI0T4SVuAqekHxBM+WSZrYKGuphO5Fckh6jPOo/hQEmzvMqelQsWQ6WAAhg7WzjgxxOJISFaWFTYnSABOzu7lQPX+42HXoN1wQ+s3ZSPQBR7gQzkTALAoCddnQqGa4Uh2CqgiTOiP6qPAU8P2kwGzER+aJx4CWSrYFLy4Lw879FPVJOKUOcAONcTNa8NYFMEXXwNwxMP1LSlAI9g+9JbgvZZyldhMZnP0HXTRkxdH6SD/B/nCV185SqN8n3ZD6NHwmqPpvYf2r9s8aIfEvkV4V4wWT5AHR0PySb3/QFM32j4tru+uaWIYQ7mAzK3HoWAMsCCOBuySP3yLr4CMlMtsAnSaNqM9lMT6OZsGzIpfkyaYzgIobYLK1H8kER/OsUggvspSgIo7vAKWXy5h3gjtMFx+2AVzNvn1nDSuGme+F7c/C9WZPFYHawADbYBPc77LLFUjBdgTlD3IliYgKGeEM5CSYRk0s+rJmMIeJzBfEKAS3oEaCxcqiEiNFUn1GcZ0BwiYpumoF1WTqtETbZNkZsCz2WhXZCkDLy1SnFAqWYDkNcCkKcDVq/r0HC8CPZT1CKzt4HMbr9vwiOvpUbLbdhQ5PP9PId5S+n835c0Jnlo/KY+Zh48jVp1q8p9VE44HSyxIpApFanswMvfU2a7fHja3xg/Pz/g+L8M8ITtMFBK76RyW1CKjMM1+2D7bTBslyNH4YeAn8RnjeJevUKquWzGn+lWH6glvXhYYawShJxfdViwxlis2Cdub8Pqd2dhiEbBDDZ8IqhzdI143PEArspdz31KPUQSKwvR3BqEcGzcwAN2f1gFKAhdzj+nDVRAnUqvY7l8xYiJWtYFdgue5FEvXrZZGmdmYq7XYJtVvNALRAPUJKjMBIGpQa0vnIJRPwGB+bJZnoEGsoZPt5QjiNWmhhBkBsM0g0I7jkAL4T6YmHUbSV3yBYI9jk2drk26iCYDALMUKAehqgYslkAKctCNwH6LAspArzqBXjJDxA2KSPA7GRKif6BUooN234NXX2PAPwmKt0korG4vDSZkBB89ifG53QBGdhiziT0q/nUnej4bMc4Pt+PfF2ny73EfJF8gqU4ewm7yMfVotyLM9/G+MU/jWbpLQRqQizk2/Yg37YLYejBq08h8OYQhHXQsKbLWmnYVgq22wk31QfLclBafBWlxWOglL2AZSVY/jXqyOOjChKxVMEX08XyhAWkbu8GycdfvCFPviUCGGSDJJykol2WoUcn6J1C3CE5mh1HYIV6wjNFdvc3l4JqaqiPagFuqh9BUAaor0isYTVACOHX/pNn1GazglLscyxk4ud5BO5rcdfRnTDGNtHAtRoh8ZzRezdJbgVSjspbcZP5TRDpMcuzTHtwRMFAUAjOUt4PKWjUIY/aNh7OuEgR4IQf4lwQYI5S1ChF0hnmA6hRijlKcTkMMR1SrLcJ9qUcLFJgPt7QS8MIVoPrPw4n1RXxZOBR25Rv5SaBTiLdui+scAauUzg56Zo0ovwN6E35Sv01ulpPqOXX6dEOwfzMv/DmV2KX5OrpdGYUnb0PwbIyqJReR61yEYG/gDCsJz9dQwOEYR2Bv4B6bQyeN4N0Zj3ybXsR+EUE/ryZY1m4xmvUcWcXBuF2kDtWZ4qZRdIYuKlA+D9JM+X4QEDNo2I5emLXpBWI/ATGNWeuR+pucE1aIFaOiNFQD2l3ARC5OiHE9cxKynIAWtdoa1gdUFpn9l0G2vg1s4YQTO4DjRjR3wYQPqRc31sKkS+KjIyqlSN+qjSHOLhakFW/Jm3ao7FmpYsACFBoLBrDbtfFgykXJ7wAr/ohyrGA0RwlSvGKH+KkF+DBlIvdrr4s2gxmTEllo8dYmX25FZLaihMEvYEpDX6SD+jeYu7IvLLJ9T5UtkED3zRcJQa9f9YY0fFFflWKF0yUT8hGBWY/J93H5M04noB822509jyAauV1VEqnEAbmmkpzhEEFldJJVMuvo7PnAeTbdpsiy8I1BmodMnDxG6FYo7CWIa7FRjtUtw6ljEb5P9CIJve5nNy/Fj1cuBU9lHItSn61PIKnjf5aOU5COTU9DvM0AgJC2IybeRtb3tHBKDRc+XLKGuKgYaj5RcRIIjJRlzTOov7YDngusZUeIVORAk0sri+GyO80rezgXE/k20YyBkEXZYsVgP+YHlH+xpD6lCJphVCOJo7Jj5yo2SwKIwJOojSHYrjdrot9toVn6z4WFfq1Yp5SPOf52Gdbyw7WkGWmygc2VBuL/onbRNZX4UubxY0TmZpLqUajitVFv8SERS6l/2M6eCadz/MxtaKkgh/RZX5OZ8WN6Kx8iqzaL3MJppCXRak/50b15luLZCLeEsi37Ua+fS+K8y8i8Myn8pePwC+iuHAE+Y69KwrW1xyoidE5UW1YQ/jHN9i11WhUHEHMlOU4LhoSRXw+PhL5pR5TTpIT9Ch5Y3oUJM64jeOo/yIG+0nd5oxbLVujcghx/vgEWwFX7v7mbp00El3DDxCi4xC9jQE+VuUJ+cfYMi9I8klDjG0SxCIwpu6j0fkh9CiiSyIS58KiQlrFdLVLQcrFyqEXMPrbBDE9HFHvrxD1/mrUtnG74+BFP0ClaffdOsqU4iU/wJ2OjVE7+ekB7WiyjBFVsyyvo17VeJsaLa5kYLJGUldoikt6JCC7WcITBli/JxIKnScMl5EQNKM48mCEM3S+bhcpG+VW+GJH5Sa3dzozikLHQZQWjiIMqyb7mhEGFZQWXkZb5x1IZ0ZNdku45kAtHUzUn0AagI1omHHESEmMZWTa+PHBUIwu8wqeum/kb6pHkZP/GvGNfflT8iXylbxqmZL4qh7piarnCmgeuIYfFJJP7wRwQUrNflhNKL7EUzFIH+I/rrMRVI2RvsgXpb4megREFlluWRD2M9Q2hJThx44yqAQ0twdHXE+TAhiwQHDIdfFy4F/TUnczFCnFy4GPQ64Lyzx5mx1P6Re0n7CMSTdkYnxDV4xvyEi++GfIyrZP0E0pbxBTv8lPyKfWr2H+JD7XJWiJfJnPtHVEIMRCe9ddqBRPIAxWL0gLhH4JpeKraO+6C4Q9i7ssLC+HGTCUtNwVQy8iboASfCahjvblyFDVkzSzVdBQD9uJ5AjBHet244O7H8G+gZ3acXJuFvsGd6I726npYRl52YVuc4YsxZYoB0toekCYLo2vlZ0AVL1zmN+cIUBaOMl/gBgdHcKP/pu78MCDt6Ont9Nk/3BBtBv3gYimM6K/Kk+B8CFzQtAAkS8aB14i2Rq4tCwI27aqR8opZYgTYJyLjTWLLoYldF4r2OfYqFKKqeD6XT6aCCjqNMQ+J3lWHQM/tcUZTpR6alXkBEHXTan0vRo/Iuzfk8F739mG++/Jo7fbSbAlS6l6k3xP5tP4kSAhwJ5bs3jX2ztxy46spANANmNh144cOjvYvSCaeu5jhO9KvhDiBZPlU/lKhkS+QEI3mmvbgzCowqtfvxdI+bVphKGHfNsek9UUy3s8S1aW8EezmEXk8jN/Gxks9pYyYhMU/t0WAOCjKQVmssnd3TLZTA+/q/qDux/Bx/e9Bx2ZNoQ0xNXSNCZLswhogL5cN1zLwR89/0U8cfLbyXqo+biCYIhN8t3bMb55BgoYcv6XLoOGlD2OFQIIQ/48NS8LZc9TUxBk89tRr1wxFLaOnt5O3HbbVrh2dNPU5OQMXjp6SpNbLrZvH8WG0WEsLpZw+JnjJvumQSozjErppE6kMc+UtJ/KsM7YdAXWyHEniolxEMdF5uDtcNevBw0ChAvz8C5cQO1Uo3ZhmmL6kg9rJmOI+FxBvEJAC3oEaKwcKiFiNNW3dHEkWGswvX/LH88yB9kEwIdzWbzg+ag0U7hC5AjBAdfBZyvKDM3wI9l/cDqlFPvu+ZbRD6qzQWEzo+yyLoZNZT9G8SOHcvjIo+3o7mL+6vkUR45V8YXH53H+Irs5VVpQ6/+YtvXrXLz/33Ziy4YUFoshLlyu4+lnijhyvBIdlz8n/a63d+L9P96FtoKNMASmZzxMz/oIQ6C704HjEHzub6bwz0/O8XJiRc9Ji/pHfJ0OULx+7KP8EibkYEAE94F1H0Jx4WjssavVhmVnUGjfg6uXP2eylsTyZtQAb0YTzBiCI0dwCgjYzFSOmomuSgR7yW+AxBm3qgcEXdl23Na/HW3pPGp+HRcXxtGb68Kege3YP3gLRtoHMF2Zw/k5FuwS9TS6Jg0mJ2ixGTfXI/lK/pgelRZnLY3lynOIIO3XA3zv8FF845uHcfLUefT0dGHf3u2m+LJQrXoIf4g+q2nWlE8GeEL+iZyC77NUvAFJNgu7twd2Vxec3l6kNm9B7i33o/3HfxypjRtNcUWvrj/xsC0gEueZRIW0ii1DrSiKzKASNEaiPSTi4okFUM+0Rthk2yjS8LoHafDr1SVKsanBtWoVIswAkZmiqioE/lN7JSL+yB09KeSeP1rBl79exCuv1bCwGMJ1CPbvyeChBwvIZixxJJZfaztG7e5ysGVjCkODLrZvTeOt97fh1395EL/+SwPYvDHN8xF0tNvYuS2DfM5GvU4xdrWOrk4HO7dlsWtHFoMDLmbnfVy+ojy5wg9GZMGjcstKaO5jeIzka7kkPUK83TO5TQiCEuh1WPI2EQZV+EEZmdwmk7UklvccdWQlvsssx4zLA7GYVfO0e8BYBo0NhJaeScuZqXlimUmF353pxENb7sa69gHMVObwB898Hq9MvI72dAF+6OPFsVfxF0cex5GxE7HjdGXa8YlDH8J/fuDn8B/vegwPb70HIShOTJyWcnxHRyvlJbqcpAOgr4rvU4ONAsW+AmF5N9WDwF/UmS1i/Ug/urs6cGVsAmNj7M1m8/NFDPR3o9Cex2KxjEr52hy2o6MNPd0d8DwPly5PmOybBrbTBt9r/a1ve232Fj6zyc1Gj7FNhCGcgUHY3d2A58G/fBlWNgu7oxNWoQ3+9BRoOXoPeeI5o/iYSm4FUo7e6M9JJ0OdUZ/g7yQwZ9S3uQ4qFFiIN1Yi/t1v/Bo+9qu/hB979P3yl8nm8NpLR03RRKQIRbtl4cIyltkH1n80qqzciPIqdCKMo/I5U7M543s+xanTdXzrqTLOX6xj26Y0OjtsuA7wxrk6pmb82MxcaqEUbgrYvTOLvl4Hk9M+zpyrob/XwbohF9mMhVdPVlCthejocHDfoQIG+13MzQf4zBencOp0BW15G35A8cprFfz130/hlZNlOeOPmiOhno3qr+zEzwVdnoJi5up/52MOZbJHCPJtuxGGVYT+ojYgbYRP/k8fxS994jG8/30PyV8ul8HRY41WvnQQy4Xt5FGrXDRZDXENM2odsloJ9aNy5CdCjDFUFCcSTxtjJI3Wih5hfMey4SjPwoY0xOePfw0f/+//Cf/2c5/AJ//pd/Hc5Zd5RvYTuu/dcABv3XK3vH69qXsE92+8A+va2ZeVYuUQMPQkzrQVSD1E6UyMEeH1wKlTF/CNbx7GqVMXTBZsYiOf068nrRSjo0N44MHbMTqqPBu6yjh012247979KBRWt+wtQzSZ4ZMmI/qbDOp7gM87S0LgT08hWGAvSrAKBdjt7K1pApEvSueLtsqhY8VqBumPYhTO9lvVI+WUMiQRor8qLw6li1hKzNCfjB7LQqvv8xtaP4J1GzeYZDz47nfgPR/7qElOxCIl6LGW181qpee2EyZsYEqDn+QDurdMzQRYKLIXdxQKNro6bMaTTa4andE8j6LuRcvTLx2vYGExgG0TDA+66O1hfa5jA44dZQ5Diq98fQ6f/C8X8O9/+Qz+2/91Gcde4QNOIkscuZryVxQ4qg73GEGI8flWJUS5EuGmehF6rU18Rkb6sSGhL3vHIz+Cn/rIO01yIgK/CNflz3W3iOV5UBMYYzD+l/2Dcq1V7oNt5T6XUxWJPKaedYV+vGPr/fjZAz+BR299O27t2yr1uLYDS7mzLutm8IFb346P7H03Dq3fo5VDLQ8FRc7NwLEczFcXcWTsBMIwBKUhvNCT5YmVN6GcqhwXlnxNj7SF4VnXET29nXjgwdvx0FsP4aG3HsKhu25L5IulcHGj2ENvPYT77t2PXbs2ybwPvfVQwyXznt5ObN6yDlcuT+DChTGNVyhkcd+9+zU9jYLtvr3bG8r09HYik0tjYnIaxeLyX0ywGqCUD+CFX0kHZo0e/YvaX7IjMZBMFiSTAbEs0HoN4eIioM7EeE+maXRdpDZtQnbvPrjrN8gyOH39yOzZg9SmzUI9rHwemVtuQWb3bthdXZIuymZlMshs347snj1wentlxdx165DduxepzZuBVCoqD4fT04PcgYPI33En0tu2g2Sy3B7ix8pEUi7SmzYhd+AAcvv3ITU6qthDsYugcLtK+0IXU20q9qJfMtoJQX0Z7yCYHB/Hf/ulX8UvvvcD+MPf/K+o8BWN3sHWPolaDSnaW5ilqaCI+hVReaXFGcswTmRqLqUajTKd/X02Hrgvh594Vxu2bExBmMGyAMfhdqTAyLCDt/9oAe9/dyfuviOHbIatEOayFgo5C4QAM3M+Zud9yNecE/G8LoXrEqhjk2zGwjse7sR73tGF/XtySv1YH/i+d3fjU7+3Ff/fn2zHxx4bUMrP6qPWn1snqrdRfyGr2oWRG/uE7bQhoKx/bwXjV6fxP37y/8SjH/x1/NZv/xnKfAVyYKDHFE0EDWqwnTaTvCRWvPTNB0RyKEYssc+WwNMHuuMjPEC7zixGO3LUY8pJMkFXrh0/f/uj+LV7fgYPb7kHB4duxd3r9+FdOx7AvesPoORVMF8t4r7RAxgo9CDlpHDv+v14y8bbcdfIHrxt64/g3tEDmK8t4txc9D5nwq9JWyC4dWArRjuHsK69HyGlWKgVkXUzOD97BVW/ljhTVusQq48CyTNm3PTVYtTHcCeVXsYhtK5k6Vtco66Wa3jyOy/izJlLyOUz6O/vAaXAzMw8No4OwXEdvP7GRVTKVdyycxM8z8OLR05gcLAX3d0dOH/hCp577hX093Who6MdAQ8o6tJ3pVzF4EAPstmMthQ+OjqEPbdtR60WlcH3A/T3d2NouDe2/D5+dRpnzlyC41jo7e1Cb08XZmbnUa/7qJSrCEOKTRtH0NGex/jV1pesG2HZS98OW/qOHFfdshZP8gVDDFYqDXd4HWgYwp+YQGrzFjg9Pex8sm0Qy0IwPwdaqYKAILV+FIUHHkB2921wR0aQ2rIFTm8v3OF1yN99CKkNG5HevBnuuhHYhQLy996HzPbtSI2OInPLLqRGRhCWSggWFpHdtQttDzyAzM5bkFq/Hplt22B3diCzfQfyd9yO9OgGZDZvQWpkBLRcRjAfvRIxs30Hcvv3I71+PTKbNyO3axfsjg74U5OgngeAILdnDzoe/DfI3Xor0iMjSI+sR3b7dmR37ACxbXjj41KfBLeL3DegnmmmYKOl7ztTLk61uAxdXFjAc99+EsUFNgfffftB7Nq/D5Zt49UXjrS0/O0D2OY4eNFLehlpMobWfyzmG1FdOUtWmfWPRlIzSTZD8OEPdOB/+Fgn7r0rh9t2ZXDXQbaEDQCVKsWxV6rwfeCjH+zCTz/Wg7tuZ3L33pXHQw+0IZe1sVgMsWVTGlMzASanfDz8YDt6upmOdMoCpcCZ8zVkMxZu359Hb4+LlEtwcF8Bdx4oYN9tedx/bwcO7s1jsRji0pU6hgZcvPNt3diyKYPLY3X83RPTmJ7xlXpHFdNaUrGLqGgkG8nIJEHDpe/2zjtQLZ3m+bWjxLCwUMKT33kRCwslAMDBA7dg394dsG0LR156raXlb0p9ZPObUVw4YrIaYuWB2uIV0wI1T1sEqf36NerYyIZyeTn4a3yNd7RjCL9y6KN4ZOuPwLEdvDLxBl4YewV+GKAn24GBQi9u6duMYq2EDZ3DGCj0wiYWJkszOHzpKKbKs+jPd2O4rQ+bu0ZwaX4cl+b1DoISYFffZox2DsG2bFjEwkChFweHd2FH7yZcmBvD1eJ0S+WFfKl+C3d/n4gCNQGNHm1T9ArLryRQ79g2inwuh/MXxjA/z968Mz09j/6+LqRSLmZm5tHWlkM6lcbiYhkdHW0YHOzF1YkpjI1NY3i4D67rYmJiFvPzRfT2dqJQyKFUKsP3w9g16rn5RQwP9yOTTWF6eh6FQhY7tm9EEAQ4dvwU6nXWgc3PF+G6Nrq7OlDIZxOvcYtyZrMZVCo1Wf75+SImJ2cwOjqMzVtHYoF+ubimQA3EnNls6hgMl6Ceh2B2Bk5PL1KbN8PK5UA9D+HCPEg6A6erG05fP8JyCVYuh9xdd7F0tQpvfBx2Ngunpwd2by8AwB8fA7EsON3dcIaGQFIp+FevAp4HK5eDlc8DhMDKpJE7cBB2WzvCchnexATsQgFuXx+c7m7QSgXe5CSsXA52Wxvs9nb409MIy6yz8hfmQSsV0GoNVjYLK5OB09EBGvjwp6ZQuPNO5Pbtg53Nwp+bQ+3iRYSVCuxcDlY2C7e/H8S2Ub/Cbu6kuhkbgp1TyYKNAvVB18WZFgM1ANyyfy8++bu/g3d/+DHcwoP0t778VfzdX37aFG2IzY69rEA9MPJTUX+hOsk1fk/6A+9px8P8hrELlz0ZlDvabVgWUKlQnL9Ux0MPFHDPHXkQApw4VcOZczUU8jY62m30dtt4+UQFR1+uYO/uLA7szSGbsTAz62N2PkB3l4Ntm9NYN5zC1LSHnduy6O1xYVkE0zM+jhwvYWbWR0+Xi/4+F6MjaVwZr+PylRq2bMpiw/oMOtsddLTbmJ/3cXVS3GimniRRnfX6C6dhHPZXtRvjz0z8fWKgbus4gGr5fEuBGgD27t2O3/6tX8RjH/wxGaS/+rXv4DN/9YQp2hCZ3Ibvc6AWFSNsVhHNqHmgPtAlsjCxpLu2FaizUXU/52bx4T3vwsOb74Ft2Xjywgv437/zR/jqqX/FkbETGO0YwkjHAAqpPGzLRsZJoy/fhcnSDH7v8GfxqRf+Gs9feQWjncMY7RhGe6aAilfF0xdfwoHhXfjkfT+NX7rnp3DP+n3YM7gDtcDDqalz6Mv3YKI0g5TtYn3nIPoLPTg5dRaz1QVWX1EBYnQKkpxQH1OOAKEI1OBOp/udFMUKAnWhkMXo6DCIDTnjFRgZGZCBenxiGn39Xejv60ZvTyempmbxyqtnYnLz80UMDvYgn89ifn4xMVDX6z4y2RSG1/VjsVjGQH83enu7MDe3gAsXr8rjA0CtVkdvTxdSGbdhsDWPL1Cv+5iZnUd/Xw/6eqMZ97XgmgI1OyE4hTVq9FflKeBtL04XAMjs2cOWjx0HwcICys8+g+rRl2C3t8Pu7ISVy4GkUrA7u+AOs6+oeWfPovzMYViFNjjd3SCEwB8fR/G7T8FKZ2D39rLZ+OQkSk8/hbBYhDMwAIu/5tLp6GQBOQhQfe0EKseOwenrg10ogAY+qq+dROmF5+F0d8Nua4eVToPWavCu8BUp34c/MYHq2bOw3BTcvj4Q1wX1fNj5HHK37oaVycCbmsLid76D8rGjqJ07CyuThtPTC8t1QTIZ+NMzCItFZg/VRg2h21ulrVag7hsaxL577oarvBK0o6sLJ48ekzPtZlhuoB4c/aiskayZ+CN8RuOrU2rBZ//u2J/Bu97Whq5OG+MTPj7zhXn83VcXcOL1GjZtSKGvx0GlRlEshdi7O4t02sKxV6r4w7+YwneeLqG/z8HG9SlkMhaqVWDXzgz27s6BEOC116v4o7+YxAtHS9g4mkZPt4P+XhdBCLS12ejtcTE96+MvPzeJLzw+heOvljE8lMK6oTQKeRvVGsXh5xdx+XId2ayFkaEUNm/M4s6DbWhvc3DqjTI8nz1uxerHKxivrk7gNhF2EeTVCtSDgz04dNceuG50H1RXZzuOHT8lZ9rNsNxAvarXqDUQRCM9ea2BbcXsk11L0IOR4It/Is9wWx9u69+GtJPCYr2EZy4dYzNbAOfnr+CZy8dRrJdhEYKhQi9SNjuxKKJrwRPFaZybvQwv8OBYNkY6BvHw1nvxiUMfwn0bDuLC3BV88/T3ENIQhVQOm7pGAACvT5/D9y68BAC4Y2Q33r/77ci5GV49vZxRRUT1eV3VeitL23L/+wi/HqBWbfy84PTUHL79refxjW8exje+eVh7vvrwM8fxz//yTOya81KoVj3YxMb6df2SVlafLV0marU6Zmb485cKisUKisUSstk0hoeXd7PGykD5iJ79FO+NRvbcR8SuyKL+7J5uuEPDLMj5PuqnT6N+6iSChQXUT59GWC4DhMDp64MzMABi26BeHf7UJMKFBYTlEmgYgFKKoFREWCwirFbZM/mUIlhcQLBYRFAq8SVpgDiOnFnTep3NlCsVhBX+ffQgRFguIZibgz87x96F7jiwOzvYtWhE5Qel8BcWmG5CYGUycAcGQNJp0CCANz6O+hifNdfrqF24gKDIBlt2Pgenq0uzh7SV3I1sKva0H+VSSh49sXycOHIUv/7hj+EX3/sBPP7nfwnf89Dd34eP/PInTNHVwwquSXMTyNybNrjo6rRBKXB5zMPZi+y8r9fD6FFKCrS32cikLYQhxdVJD+NXPZQrAWZmfXg+YNsE64ZdbNucgWUBc/M+vvGtebx6sozjr5bx/EtF1OoUqRTBxtE00ikeWigrIyh7lvrSlTo8j8K2CYYGXAz2pzA2UcMffOoKfv+Pr+DMuSraCjYeebgbj72vH9mspdVf1FW1C9Pf2C5av7wKOHr0FD7+M/8Fj37w1/Hpz3wFnuejr68Ln/iPP2mKrhquX6A2QPgwWZ1ZJiFxxk2Azkwb2tJ5AEDd97BQK2p6JorTqHrMCVO2C8u805Lrqfk1BDQEAUFbKo+3bb0Xu/q2oOJVcfjiUXzrzLN4nt8R3pbO49LCOL5+6il87+JLmK8WkbJdHFx3K27pYy9yUeuTVC9JS5pxqzPy7yOclI10hj33+INCLpsxSRKNBhKjo0PI5NK4cHEcxWIFhUIW99yzV7ujXAwAltK/+uCNyfdZKqFdIxG5r0pZmQxIhpWbenUE83NSOCyVQGvMJsS2QcQMLwhBa/xlFUHAey8AQcACJg/SlFLQIAR8H1Y2C+I4jO557G4isA+SUM8DgoB1fLzDE3cdUc8D+HeAiVhBg1ofAmJZbFZCKWjgg6TTzO/DEGFVv9kvKJVBa3zAZtkgqZRuIwPqmZYoKGyakFegTinSZt/QIr79xNcwfukSACCXL2BoPRvIL4UsIagvN1DIflImNRubSVldZV/w29ts2DZrzlqNIuATe81EBKjWQnlHdxiKfhicxsqfyxLkssx28wsBLo9HN2BNTfuoVZmfZFL6zWRAVFgxQCAEyKQt2DZwz50dOLi/gKefW8Dff20KM7M+MmkL+/cUsHUTv3GUV0g9r3S7aGKRLQx+EsKwDmLFb5JsBV/7h6dw+TJbGczncxgZiSYjjUDsDEJ+c3KrMM256hCjKTGjFP/E0IePASO+HCFFeUGBMAwR8g7Dtmxk7HRMj9BV9euo+7ohhC5CLBB+zdgiBJu6RmBbNor1Ms7PXcGlhXF88uu/i7v+8FEc/IP34T2f/QT+4dR3cHLyHCZK7PVyfflubO/dGC9vQnka1UerLy/39YaYcZqPYRUKWTiO03Cm2ipK5QoCGsBxHO3O7EyGXasqV6qYnlmAF/jIJAwU0pk0nJSNYrGk3cF96K7b8NBbD2Hb1lGcOX1ZzuaHh/uQSrsolSNZEaBXMmNfPlijir9RKlFMDP4lSbK1LKx3Edqife474pZd2wJSLuPwoMyCJLsdlwVvrjgIQFIpuIODbJbrefAmrsoASmwbViaLoFKBNz6G+qVLqF+6BG+G+T1xXTbzDkMEpRLCMv+cBS8iSblwenpAUimEngdvYhJULPkSAuIYX5SiYVTnMACt1yODJJpPWkARiASFXXU76ligFOmlBBQ88M5H8NFf+WWZvmX/XvQMtHa3t0AapOVntgWifoFVyuwr9H5FoSfw6x6zMSFANktg2/E+h4YUp8/W8fqZGg/SogyALx7Hij9WD3Z7EmuLMIw0ej57ZpuBtxgvD+GBk1IgCCl++kMD+NX/MIyHHuhCe5uNk2+UcWWcDUjb29hSumYDUXKl/jDrjcgurHh6fU0E/iIsO94fJeGRH7sPv/gLH5TpvXu3o7+/tbu9BWziLPvS5XUP1GImDeijIQF1NqrNTI2R0NXSNMaKU6CgyLtZbOwajpgABgq9yLoZBGGA07MXMVacREhDOJaDXCoDwq9zD7f1IWU78MMAZa+KQop9Uq7m11GslePl4JipzGOxxpbpMk4KA4We+AxZgdSzxEyagL8kxsx8HfHG6Yuo1eoYXT8og+nWLeuRza78EafpqTnMzSxoS889vZ0YXtePSqWGK1cmpUw+n4s9W71+XT/8eoA3TusvAjj8zHG2BH/sJDZvWScfBzOX1Ht6O9HZ3Y7FxVLic+LXD6xRo78NINqe/0xQseQMgKRSLOgJrbkcrDTrTMLFRYQL8wCl/E7xYdiFAsrPP4/pP/8zTP/pp1D67ncBAJWXjmD6L/4c05/6Eyw++a/I7LwF6U2bAd9H5dVXUH7hBfhTU6BhyI7Z3QUAKB89irmvPoGFb/wTvMuXYbe3w+nsZI+O1WpA4MPljyjlDxxA72OPofeDjyF7660AIahfvIDyy8fZXephCGLb7Bp7NhrA2YUCLL6CEMwvwJuaip1HOgSTG1KjNbCrQZgOQ7SZMktg76E78PuPfwm///iX8PP/+T8hm2P9xdHDz2LsIptdL4WCxY65HBD5R/EZpdaiX1FlZH+i5ifAxGSAao0FSPFyEkKAjnZHzo7LFYoz52r4zf9jHI/+7Fl86jNTXDEHj3F1j6LMZ83dnQ7Wj0Sz0N4eF+kUQRBQXB6rY2raA7tKYiGbYZ8myWUt9Pe5cB0mF4bAti1Z2DbB4qKPhQUflk1g8xuU/YCiVmcPbRvV1QncJrK/jYgKtzG8+hRsm63WtoI779yNL37+d/DFz/8O/pff+BnkcsyHn33uZVy6FL8J1oTltMHzJk3ykrh+gZoC4HdDUz4UYyMdbRAsRz1yrMRnm0JOjIQuLVzF0xePYL5aRNpJ4c51t7GPbQDY2j2Ke9bvQyGVw0RpBv/4+lM4fIEtVXdm2vHQ5nuwtXsUD26+EweHb4Vt2ZgszWJscRK2xd/TbIz8JI2XlVKKgJ9wBASu5Ug5LqyVV+ox62PUV8ipHzC5nigWK3jp6GsAgLsP7cVDbz2Evr5unL9wZVWC20tHT2FxsYQNo8N46K2HcGDfTlTLNTz13SNyEPDS0VO4eGkMO7ZvwPbt7LNv+/ZuRyaT1uRMiCDf09OF0dEhXLgwhouXxtDX160d6/v9nnHZloofcUa0pXLwL38mgtkZ+Fcug3p1ENtGatNmpHbsgN3djfS2bSDZHMJaFbXTp1E7fZrNhAlBanQDsvv2gShBENFhZdlAKbzxcZSefRZzX/kySocPIyyVUD9/AWFxEcS24Q4PIzWsD4IBIDU6CqevDyAEVi6H7O7bkB7dAFA2qLDyeXajm2WB+j5oEIK4KdTOX2CPchECt7+f5QFA3BTSGzfCLhQQ1uuonj8Hb2IisplSbtW62o9VqqldVVwKQvS38EpPALh6+TI8fi1foFIu4w9/87+2fNd3v2Xh0jJuXoNwG6NSstbKjFFWNqE/4cI49koFZ87VQSkwNODiXW9rx7YtKbzl7hyGh1wEAQvSl67Ulf5KlIIfi0e5hcUAp89WEQQU7e023np/O27dmcPt+/K480ABmYyF8QkP335qHkeOlbBYDNDeZuO+Q+3YMJrGoTvacNuuPGybYGbWx9WJOmybwLII1g2nsX1bFvfe2Y71I2lQCly4WMWZc+ztZaL+bF+3CyNHdNkvy5m0QktArXoZTqq1e1ouX5mAZ9wYWC5X8Vu//Wct3/XtpvtQry7vWw3X8FEO1mrioxzs8SwavTbU5msiFgFsC4WPs3eaUvUxJp5FBW3hMaacm8Vjtz2Cn9j1MDoz7Th+9RQ+e+zLeGTb/XjLhoOYKs/h88e/is8d+yqybgY/f8ejeNeOB5FP6R3YRHEaX3j5HzBbmccnDn0Y3dkOTJRm8H9/99P4xhtPs8MZDbu5awT/64M/h71DO1Hz6/jsS1/B//u9zzcuL4epx5QT9Q4eH2Mf5AjYsiYJKWjInY17qfZRjuqVmK7Vxvbtoxhe14/jx9/A9FTykvi+vdtXNdALjI4OYWSkH8eOndICt/jwx2p8RKQRWv0oh2jbj6TZM4lxCQOUnT6mS6iw2tuQ3X8Qqc2b2U1lfDmb2DbCSgXVV15G9dhxgAC5O+9EesdOEMdhz16Pj6Fy7Djq589pOhseTilIdu9e5PayYF8/exbFp78rb/RKb9qE/F2H4HR2IigWEczPIyyXQX3WYVVOnoQ3Nob0xg3I3bYH7rp1AKWovvEGFp/+LtKjG5Dftw9Odzf8+XmU+V3suVt3g1KKysmTKL7wPELlEoaKqJTcgNpWkVOSj1M2BzHv+ib8oxxHPB+lpRpiFZAnBPtb/CgH27Jzfe/d39D7FeOxLFZzha/sSL5Cv21XBu//8Xbs3JaBbQNBQGFZBL5P8dyRMr74d7OwLIL3vrMDfT0O/u5r83j2Bdb27357Jx59bxcyaQtPP1vEk08v4J1v68StO9lM2PfZbN22CS5eruNvvjyFbz+1gGzGwofe34cfvb9DztwFpmY8PPGPMzj6chE//aFB7L6FPRLm++wmM0KA8xer+KsvjeOZ59id9fF663EkzhdHi+xy+vjP8AUW/a5v8I9ylBaOrep3qJNg2VkU2m9b9kc5Vv54lkjwdSf2eBZ/XMUicPd1Jhi0wXPHajKB7wUeXhx7FWdmLyKfyiLluLg4P46+fDcOXzqK3zv8V3jy3PMAgHrg4XsXj+Lc7GV5Uk+VZ/HU+RfxR899EV8/9R1k3SwODu9CT64TtmXh8vxVPHeJz8aM8m7v2Ygf3Xo3OrNtmK8u4hunnsbJqbMtDTDYpgGfQ32Omo0WhSyzd7R37Y9nLQejo0PYtHEElXIVr7/eOABv3DisPVe9Wrhl5ybYto3xq1PaY1Y9PR3o7GhDuVxZlZebJGG5j2ftcaI20rB0k8dAQUFrNdTPn0OwsMAyErBHoS5fRvWlI6idOMHu7A4CeGNjILYDu6sLluvCbmtHanQU7uAgYFnwp0UdhCK9JGrKu3oVweIiQCm8q+Oo85umAHaTmZXOwJuYQPGp76B89Biczk5kd+2C094Ob2IC/vQ0/Lk5EMdGanAQlptiLzKZmETt7BnUx8cAy4KVSiNYWARJZ+DPzqL43LMoH385upatgJ0zSudhwOwiVJwQZ0tCoHZAsNG2cXWZS9LLxS7Hxmk/wNgyjzMw8pGovwBY/WWS7eiBXDWG4IskxdVJHy8eraBYCmFZBEEInL1Qx1e/sYBPf575yIff34V77szD84HDzxdxdYKtJOzdncOuHexO7zfO1vD1f57DU4cXsbAYyGNMTft45oUiPv+3k3jxJdYHeD7Fi0eLuDxWkz3X7JyP548s4nN/PYF//e4cZmZ9PP/SIiqVEK7D7u6enfPw4tFFfPoL4zj2stKfxOqXXP8oYMfzzU58uWGgJsRGJrcRXt1Y9l9lZAs7UCm9gXot4QU/S2DlM2rCSdqM2mKL6raF/Mf5V3/Mo0g7r3ymzTZmRiNpntV8hv6r934U79z5ABzLxrHxk/idJ/8Mr02yZ4aFHAB8/OB78PGD70U+lcXzl1/Bb3/7T3Bm5lLicQhpPBBpNFAJ5YyadYwQn7ukvOzf5xn16OgQtm0dRa1Wx0tHX0tcjhYypVJ51ZebD911G/L5HF5/44L2KNi+vdvR09MVo68mljuj/jCfUTdrENMlGiESo7rehCQApDZsRGbXLrhDQ9Hd4JTCn51F/cwZVF59RV77lhm1zq01CDniumh/y/1Ib90KWquh+OyzqLzyCgAgs20bCnffDTufR1AqYfHpp1F943VNjwA16mMiTk7OIFMKeakZtUUsvC+TxrnAx8R1+trboE0wajn4m2oNoVqwFmbUe+7+p5izRP2f2U8q+SU9yisDV8z5eD5Q7Niaxs99rA8bR1O4cLmOP/6LSbx6kvnLTz3ag3c8zF5a9cQ/zuEzX9SvrbL+WSlfxADkC58a8NXyqXTDN7X8CXaR9Uuyi5Lv9Ms/u0SgttA3+D5Uaxfg11ofpC8HbqoP6ewIpsb/FpQub/C2qteo46cEt5diW8qvIYh/EIGIywrDCjlGjmaYJl/Vo/4kT71mwY8h9JS9Cv7lzGFcmGMd/s6+zfiJWx9Cd6aD5eFyt4/sxlu33oN8KouFWhHfOfs8zkyzIG2WR+yr5VDLI2lGeeT+DYILF8ZQKpWRzaaxb+/O2Du4t28fxY7tGxDQAK8bN3+tBq6MsZGtetPb6OgQenq6MD09e92C9LWDtznfZe2s/+JgguY/Jix8SPElPSkRViogqRR75EqAEDjd3cjdfjs63/sTKLzlLewas3peNHE5eSxZJKWOHMR12Q1oKRcUFMR1QGz+uJfvg9ZrMk+iPRR9vPaRHcwf5VKmnmYVMRCC4rDn4VbHQd4I5KuBArGwy3Zw2PP0IN0qlLaJ+g324yaIvEX2O4LPjteov5EWFvko4Hls2RkA8jlLPnfd3mZjcMCF6xKUKyEujdWkvdXjiuMIvaIcsj8UfFEWtd8WTafQ1fpDllOnq3aR9VP0qvVjhV4alIZYmDuMfP4WWHb8ewMrheXkkWvbiYXZZ5YdpLEaS9+Qd1ry2bVFGNdioxbXeIUoez5P6DBu5xM0vk26V0/ym+nhd1Mn6uF3SQLAxflxpGwXO/s2o5DKYUvPKEY6BjBTnseGznX4yP5340P73onN3evhBT7++Y3D+KsjX0aFP7MtdRNj9M7Lo5VXqZsmB4C+xpa+mXPxZUrDv0Tu78fSN8DeXiber71+ZBBbNo/IX2dHG85fuIIXXjiR+AaxlWJ+voiFxRKGhnuxYXQYWzaPoLenExcujsm3pF0vLHfpe6/Lx7uiWRVfNDzPgBBUMjCn0dlN4PT1I7VuHcJqlb3ghFLAstgzzQCsFHtbmDs4BFqtIJidbUVtVBRZDk4IQtj5PNyBAVipFHtbmesCfoDMjp3ygx71S5dQee01eS3brKYJ9QxJFOS7RPY5ySCENHwzGasGwTyl8AnBPsfGNKVY3lOtjZEjBPsdGy8EIV4X9V4mBkY+EjM5jH2Vr+5IvtZ2kQ0iPu+vAVRrFBvWp7BhfQq5rI1MmuDchTr23prD/fe2IZezcPpsDf/0rXksLAayHJHWqAxEYWhH5XRZJrNXlnyjrMaBZDLmmyyh8QWdEAAUsxNf4XaJmKp/BP48KALk2/fA96ZB6bW1nwnLziDfvgfF+RdRKSevLjXDNSx9sx2x9M3qzK1mRTeSEYuA2ASZx0ZhpW1tVAeI4ZKSTOIz+/Kk3NGh8EnCkrJEEz0/uecRvG/3w9jQuQ5WQi8wW1nAN9/4Hv78ub/F1eJ0Qz2Jx1HqIUDVJf06BX3iKntTkFjyDsOll77rY0BgHnwNK4ZFkEoPoVJsfen70bQNF9HAypRrhJjGRr6iJxtCylH24Gt661akN22GOzgIK5djwfPyJSw+9RSCueSbA6HpMcsTEaxsFrkDB5DdvkM+YiWlPA+1CxdQfPFF9mGOmJ5kMHs0Fmx0apvwCfDlsPHStxq4drsuDvJXfC62eoAG6CAE+1wHL/gBXjbuFpcw/Cg2G6TArjseh22xx8CELeK+ItKCn0yPyPqSssIBAGzfksZHHu3BrTuzIASo1ykch724ZHLKw+f/dhr//GT0IRapn+uN1BrHl5tkeuv1U/LF6qHkblD/ICjj3Ilf5BMm5gOmL4h0vm03Cu0HUCoeQ+Ct7L4b2ykg37YHxYUXUVrkn1a+BlzDjJrtsErxCotATRDdSMbvCLc35GDlHT5aZgrYiEbVJ0Z4Bl+ByE8QyXEGmDjPq+hJQqwcHC9ffR1fOv51XJmfACEEIaUo1cs4PXMRXznxbfzOk3+Kr518EqU6f85V6BEDFQGlPKKs6nEiMaUM8x5wvsJ8i3Jn46s9UU52LQYgcNwOIPRBqfjG3BpWC5aVBiEp+N6syYpBtM1GmyDL2535g3b+N0Tki9Jpoq3IHz9VmoMfPJiZQe3MadROnQT1ff4cNoE3Po6Q39GdBHk8pQwmgfo+6hcvwBsf50GAICyXUb9wAYvPPovSkRfZK095cWT5l6xI7IBaBs2uS+hZBMFZcYY1CdQTYYhZSrE/5aCDACWKZc+u84Rgu2NhyLHxVN2/5pm0qFRX7/1wUso3EtT+RG0KZUckIxvpfahsgwa+OT3r49WTVRAAjksQhBQTUz6Ov1LG40/M4rvPFpX+WQFRjs8ZmhQvmCifkI0KbPL5ViXwXIQLSrKyI8XV+ivw62NYnPlXoIVA7dUn4HuzyLftgeO0IwzLy55dW3YWmdwWuOlBLMx+95pn0gLLm1EjsgabUfMKEwJK+Ac5jBm1e6gb7s6OhjNQNkdMmAmbyVb4JE6PDrvEcZbzlaul9Kj8FvSIND1TAj26AIQADfismrI3BhE5o+b7IEhlhgEarni0t4Y4bKcAEAv1avQJVAAwZ0Iq7ZBLsJWQOD8G5mwxTdwHk8hLIeJzBaZPciRT45BysQx6AWPsBmhQHAlmh4SKCyxdrRiE2HlC8GIY74ihdMYmLLBl8F2ujToIJoMAMxSohyHM2yizAFKWhW5C0GdbSIHiVS/AS37Q/Jq06UcirWzXbfkVdPU+rEop/YWaO9rX+7+4TKy/km0pbsbS6VE+Zq4ovygHAMJWANhhjWNKsVW6mcygc2Gdr9BVCQJgce4pTF76NI9X4DFM94VYmljIt+1Bvm0XwtCDV59C4M0hCOugof6KY2KlYVsp2E4n3HQvLMtFafFVlBaPXdM1aRPXHqhF4/Fr0RRgd3zzmTT489TOhjzSPzqw8kDIsRw9SXSZNPWbyWbH4Vi2HslQdg/PIrxSYQE6YAEaIQ/U4Gl5NznguJ2wrbaWZn1rWB6cVDcCfyFuW7ODVWgbbAs/4vA2XVZg4RlMzcvW0wCGgoZyBqRcg+IJRoJFNDTXwxCRVcF4hlbt8SwsXBKrUS0GahWbbBsjtoUey0I7IUgZ8nVKsUAppsMQl4IQZ/nrWluF1mdIv2JBD5Sio/ctWL/1f+Z8KSikjHgldgRfJHW62KfStDpd7iXmi+Tjbc7Tkp9A576se4zgi40R0Hm+xny2ETuaXbT6se3VS3+M0vzzMnbBCNTN/CKT24RUZhiu2wfbaYNl6a/DDUMPgb8Iz5tEvXoF1fJZjb9SrChQg0YvPaEAC9D8nfywo5eeZD8wApLR3wbUNMDFGkQy+Gb1AnqiHt7gy9Gjpk0k6gdAqyHw9Un+SBa7Nk0DMEcLWSHYzFq4IgBiIZvdgnptAkx4DasCYiOV7kelfDpu11hHJMiM8v6UhWav9Y93chzJrtEUkZx01gb8pSHluJpkQvPALBB1liZHB9PXWNA8ZRpBFasD+OoSj2Zxhkb/vqPBdWq2ZcH0lgNfhO22KU0gcnDZKLNGj8jJM1CNn0CX+mPG5+nYeaDQlaaMaigJRi5Df6x+Sj6lHjIgN8wnxCN6GJRw7rVfiQK0CM5LzKZvNFzz41lmO7JQzV+FScDuXAa7ASo4wb/bqtgh8Zq0yjf+KQww8cjY5gnJxCLd6r4ioOkBMU5sSU7QY8op15BieqSY/k/idJGduHyJm/m7snRkGhoAaADfm4Gb7pblXMMKQQA31QPfm4kHaaDpSXyyhdWtqO3Fj1GXSrYG4aziAh3btqpHyilliBNg+G5jzSTxOmISYgfUMqjVWUqPyj5DmnRpTdrxRsHs5FeYtWO2ZClZZ3lNVofMp/ETbIsG/ZXWP2uMyLdEflWIF0yWT+UrGZL5nABEvmbUX3i1FI/l41vpOwSLc9+K8W82NPHq1sCCCQGLLxSU8tF3yOJN/eV5BPPsyzhipMSCUjRK4nE+xhf/BF/KCZ6ihytL1BM7DmX7qv6W9fC8mh5enqX0mOWlix7o6TKomCvzbFHuJLdix/DqU6ChD9tpNwXWcA2wnXZQyq5DLQeihV4OQsTvGGCNb/5jo1zhQ4ov6ckYBJ1r4cLxn/SzBnoE5LFkkYxCKEfTys9yK4oUfcovLibKFO1pP37MmB7xM2BqKIPgJJdLOnNudLAysyA0fvFzqNWuKP1F1LYAGvY30sIin2yLiK7aWKUJutApZflxpKziY/KYSj7JF2VlBY7Kr/qmLKdOj+oXHUfVq9aPV0SWReV79QlMjz8hbStws/nHNQbqyDAqGJUtwZGQmzykICGB/yy75idG5ProPILkN5tx87upE/XIkZeuR/A0vpI/pkelEWPkaepR7u7W9ChyhO1Eeo4XQULI56aJdDx2LTpCsr292lVYVgaO2xmNVtewPBACJ9UJy8rAq7Hvyi4L3O4hBV6I3RjKG1/+OE3ZVV2lGSJxnklMG+T0wZRrAlEUmUElaIzEc0MiLp5YAPUMSRTku0Z1loQqdowSdrXoJoOsg2aSEFfP/4liKrYjRbS2i6wQ8cW1WMPEok9tYGPCjycPKxnsj+BLkthT8klZyec0pb9UxLQDyWTMN1lC4wt6ku/z+s+OfwlAGOlQjnUzYXmPZwlwSxEirouxfQJ2nYKA3QXOjMWuW6Pkg1Z8WOv4W19YNhmDxOgrFpMUPkm6liywUj3XUB6ZVvIJ0CbXtsOj88BYldHDaCRLeLmioM3eyZ90VlEaIAzKsJ0CbKcNlHrJy7ZrSIRlp+C4vQBCeLUxhMadnEmIt0JEW+Av0RjiBNn2Ao18RU82hJSj8lbcZH4TRHrM8uiElvXF9CSD2aOxoHlKNkJcjOI4bIg30rPuSW8pmUo4j77v4EvHaprvcDrbVquXQcMKCu379bZnO4LCyUnXpBG1ZQN6Uz7XG7GN48tNMl3qN1vNqEe8P1XlldxL1d+gz179ayzMPi39QfULddKV5C83GlYUqKNdo/KcT0g0LCIA6JwHWvHhjOSVM0dkUf6pRiPsJ13YnCEbEDrEvsJYWk+D8oDojarqEWXVjiPFojKYfHp0HuRClc2m+ReyCH8kC9wXCb/qD35IeSOZAUoDBP48CLHhpnth21kQy2VtQtiXl9bAQCwblp2BbRfguB2wnAICbxb12lhrz6Qv4XcCU2EUrKO2l04TbYUqI9kS5HmmTCtW/Zq00KfSkiFPcywpFtOv0/TqLKVHzQ0AL8PGG4qbJ/UPhDFM8g2DmP34tlw8gTCsoq3jAKu3tJFqdKUNVBsqMFwlBrU/1NiEAMIXRH5VirHFRspKQozPtyqB5yJcUJKVHSmu1l+BrB83xOzVv8bs1D+xvFxebkUGkddI34hY/l3fMA1oPE8N/s4TAlDxTDVhj2sRYgE2YA1m4NzeCas9uk82NqIzk3LEqNOjgdjSM+VmM9yW9Kj8FvSoaYBdk8bLRWCyzq7fU3ant3gci4Qhi6vibm/KLx1ABOq4Tg3EhuO0w7JzsKwMiOU0lv1hBAFo6CMMqwiDMnx/YfkrENwvYmbl19cERiyCgzZBXnyiMMF3YzoMRHyuwPRJjmRqHFIulkEvYIzdAA2KI9FsBt2kWjGYYmUQHKME6lvfkzrdqLu6gTpjw18YiVMkj6+0gaK9604MjP57pFKDhiW4ZMyIUgNrAckWOyIf76ulgCgDbqrnpAXf8yYxO/4FFBeOAQ2C8802mwauNVBD1pDVkeqvE2UvP+FpC+yPJV4xarE8NmDvaIezsw0kGz26tZyAmkSXSdNxzWSz43AsW49kKLvVAPR0CThbZs9JU+UVoSEAGvJvT5svOYleGyqVNijnGr6PSOhkgTidALjNAbZb7KUYkRxjmq7VCA3FDAUN5QxIOV6OeEbGaFBLieZ6GCKyKhjP0Ko96gBOE+C1kH0aUaBRp9uI/gOH6UdKOilog1oYXP+T6Ox7J2ynTUjyLdun0rQ6Xe5JumFsGTjNRojKoaR0+g3wnHTgF7E4+y+YHn+CrSQ2CM6mL5jpGxUrDtTsrz6rBvgwzeI0/glMEazFzBpgNHs4A/RnYPW4IG0uSMriDZMws+WIBUhTTHOABD28wZejR02biE4sAB4FLXrArA9M14AJTy5xqzNp+dw0jXjCE1mgjt5GphRkDT9oxDotBWbnCza42uBYGCRANyEoEMBVfaYBIi7zCb3zbXD8BEg5riaZ0DwwC0SdpcnRwfQ1FmxSfQZC4IOiSAnmCDBBCS6FvJPn/Y/cS+hwJSWB9wNHzFdUmphN6zT+H52996HQfgCZ3Ga46QFYlv7FJ9234vtx3+PpmG8rdK0bkoVTNmouQ39UGf5XyUfU4ybMwLV87G8YVBB4U6hVzqNcegWLs88pLmEG6ThNIIl2I+LaAzUUo3BDa7NqsFk1IRRULH9rwVqZeYMAFgvuMmgKq6vXLEw0ZFxHJFgr8lE+CxZ1oBQImdvRkLJLxhAf3eA2o+orQ4XPRrNp8LeRyQMnHH8NPwDEOjQFSR2w0X5x/hoaQZ7m8Z0o1aCzXYp3QyDBV9RZbxRP9X3+P0qbSCDd1EhsQkYUoUKmG+637jc3GlYWqBEZSI7HxWMBIhATJViDXbcWy+JQl8qFwQjhtzkbRjTtubJSXzuWKoc4k8RnKvlJpy5lg1IWkEM+3wgpe+48QY4Aa7PpGxkJnazEUjyT01jwhxfmeRYnAE0626V4NxQSfEUN1vy/sc/T8c0SaC5xY2DpNpNcY4e1t5LW9nWdN41vcKxaoGZ/lSVwsK0MwoTPmC0WfNhMml+3VgI1JYSFJ6FX2HJlpbx+0MonRr1EPl7FZtZ8Bg3x/m4WrEEpf2aav9GNRjePREveXPmNWv8fdiR0shqa8ddwTWjW0Tbj31BosDqjLU9rfsT3EruFOOXNBb1NlfCjxCG97RODNGNo9BsZqxSo2Q6LsXwJXNhBBmsuS1iCQF0Sp4wpdMktkZNro31uHIhzhtddpYngLYNxyK/AiJfBUJZFD9IJS94ra6E1XG+0EowbdMZraB2tdrAEzWVuODTyITNAx7oDJZW8+6aBEmqSqLzdI1qSH7TqQzcaVh6ooVtQC9Yi9opr1oR/BhP8ZjO+LA7wYA4x8+ZKGQvgjnejmVYYjoiE2KFgwZnPjAG2vA3KIzPfp6KqSwVp9UBruHGx3ECszpYUJFPf/Fjy3G6xU71ZO2GJloK1JMquZmk0l7jx0bg9RagwZRgpgZZAvxmwOoEamhX0YM154m5wqlzDltGNp1nQjpRRTe8NDhF0RQJQgrOgKQGasrS8Ji2C+lqQvnmx3GC9hlXDzdwJa1jKhxIDtsAPSX+hxJkkECT7wM3uH6sXqCGtxHYJdyxBU65Dy4AtBHmAZgviRhs0bJjVK/byYJYDrCxqceSTDOLk4QEaUYAGsBak36xYqrNdw6riZu+AE9GK/ywZtH+4IONIAzTj3wxY3UANaRW2SxSHis2uwUOZukQe5WWb1S3a9Qdfrgdk8BZxly/+M44M0Mw+wpHWgvSbCMbS9lpzrh5iXe5N3gk3RCsBW4Xhc1hO3hsYia3bQptLiRZkb3SsfqCGZiH2l/CAbQRiEaAiCMeMZJTNDYmY8WRQhl5yMWAxA7Ra37Ug/eZEQgeKtWZuCQ3P/TdB59sylhuwf8gRhZ83j49cn0CNxsEawuFUI5oB+c1gYHVpSrVwYoBmKXWzhjcxGgTuNSyBN0OfsFIofrPmQTo073gT+sr1C9SIWS/aiwVtnS+RQLrhEbMmW+bWQ/JagF7DGtawAjQY7CVT31xIDAtvwuCs4v8HWAqpL7DiC4sAAAAASUVORK5CYII=";

window.socket = socket;

// ── Bot Detection + Challenge Token ──────────────────────────────────────────
// Runs silently on page load. Checks for Selenium/WebDriver/headless signals.
// If detected: token is never fetched → setName fails → bot disconnected.

let _challengeToken  = null;
let _challengePow    = null; // computed proof-of-work answer
let _isBotDetected   = false;

function _detectBot() {
  try {
    // #1 — navigator.webdriver is TRUE in ALL WebDriver sessions
    //      (Selenium, Playwright, Puppeteer default mode). This is spec-mandated.
    if (navigator.webdriver === true) return true;

    // #2 — No plugins: headless Chrome / most bots have zero plugins
    if (!navigator.plugins || navigator.plugins.length === 0) return true;

    // #3 — No language list: automation tools often skip this
    if (!navigator.languages || navigator.languages.length === 0) return true;

    // #4 — Real Chrome always has window.chrome; modified/headless builds don't
    if (/Chrome/.test(navigator.userAgent) && !window.chrome) return true;

    // #5 — Selenium leaves traces in window properties
    if ('__webdriver_evaluate'        in window) return true;
    if ('__selenium_evaluate'         in window) return true;
    if ('__webdriver_script_function' in window) return true;
    if ('__fxdriver_evaluate'         in window) return true;
    if ('_phantom'                    in window) return true;
    if ('callPhantom'                 in window) return true;
    if ('__nightmare'                 in window) return true;
    if ('domAutomation'               in window) return true;
    if ('domAutomationController'     in window) return true;

    return false;
  } catch {
    return true; // if the check itself throws, treat as bot
  }
}

_isBotDetected = _detectBot();

if (!_isBotDetected) {
  // Fetch challenge token and compute proof-of-work
  fetch("/api/challenge")
    .then(r => r.json())
    .then(d => {
      _challengeToken = d.token;
      // POW: same formula as server expects — (nonce * 31 + nonce % 97)
      _challengePow   = (d.nonce * 31 + d.nonce % 97);
    })
    .catch(() => {});
}

// ── State ─────────────────────────────────────────────────────────────────────
let userName            = "";
let userBio             = "";
let partnerConnected    = false;
Object.defineProperty(window, 'partnerConnected', { get: () => partnerConnected });
let partnerName         = "";
let isFirstLogin        = true;
let isReconnecting      = false;

let msgCounter          = 0;
let typingTimeout       = null;
let isTyping            = false;
let searchRetryInterval = null;
let pendingScrollRaf    = false;
let gifFetchController  = null;
let gifSearchTimer      = null;
let gifPickerOpen       = false;
let unreadCount         = 0;
let replyTo             = null;   // { text, senderName, messageId }
let lastPartnerName     = "";     // remember partner name after disconnect for blocking
let canBlockDisconnected = false; // allow blocking a partner who just left
const originalTitle     = document.title;

// Tab-away feature intentionally disabled — nothing happens when partner hides tab

// ── DOM refs ──────────────────────────────────────────────────────────────────
const chat           = document.getElementById("chat");
const messageInput   = document.getElementById("messageInput");
const sendBtn        = document.getElementById("sendBtn");
const nextBtn        = document.getElementById("nextBtn");
const scrollToTopBtn = document.getElementById("scrollToTopBtn");
const blockBtn       = document.getElementById("blockBtn");
const nextBtnCounter  = document.getElementById("nextBtnCounter");
const blockBtnCounter = document.getElementById("blockBtnCounter");
const reportBtn      = document.getElementById("reportBtn");
const changeNameBtn  = document.getElementById("changeNameBtn");
const interestsBtn   = document.getElementById("interestsBtn");
const bioPopup       = document.getElementById("bioPopup");
const bioInput       = document.getElementById("bioInput");
const bioSaveBtn     = document.getElementById("bioSaveBtn");
const bioClearBtn    = document.getElementById("bioClearBtn");
const bioCharCount   = document.getElementById("bioCharCount");
const nameModal      = document.getElementById("nameModal");
const nameInput      = document.getElementById("nameInput");
const saveNameBtn    = document.getElementById("saveNameBtn");
const nameError      = document.getElementById("nameError");
const onlineCountEl  = document.getElementById("onlineCount");
const gifBtn         = document.getElementById("gifBtn");
const photoBtn       = document.getElementById("photoBtn");
const photoInput     = document.getElementById("photoInput");
const gifPicker      = document.getElementById("gifPicker");
const gifSearch      = document.getElementById("gifSearch");
const gifResults     = document.getElementById("gifResults");
const gifPickerClose = document.getElementById("gifPickerClose");
const charCount      = document.getElementById("charCount");
const questionBtn    = document.getElementById("questionBtn");
const replyPreview   = document.getElementById("replyPreview");
const replyPreviewName = document.getElementById("replyPreviewName");
const replyPreviewText = document.getElementById("replyPreviewText");
const replyPreviewClose = document.getElementById("replyPreviewClose");

// ── Sound ─────────────────────────────────────────────────────────────────────
let _audioCtx = null;

function getAudioCtx() {
  if (!_audioCtx) {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return _audioCtx;
}

function ensureAudioReady() {
  if (_audioCtx && _audioCtx.state === "suspended") _audioCtx.resume().catch(() => {});
}

document.addEventListener("click",   ensureAudioReady, { passive: true });
document.addEventListener("keydown", ensureAudioReady, { passive: true });

function playTone(freq, duration = 0.2, volume = 0.07) {
  try {
    const ctx  = getAudioCtx();
    const osc  = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) { /* audio not supported */ }
}

function playNotification(type) {
  if (type === "partnerFound") {
    playTone(880, 0.12); setTimeout(() => playTone(1100, 0.18), 110);
  } else if (type === "message") {
    playTone(660, 0.1, 0.04);
  }
}

// ── Tab unread badge ──────────────────────────────────────────────────────────
function incrementUnread() {
  if (document.hidden) {
    unreadCount++;
    document.title = `(${unreadCount}) ${originalTitle}`;
  }
}

// ── Tab visibility — reset unread badge + reconnect on foreground ─────────────
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    unreadCount    = 0;
    document.title = originalTitle;

    // If socket dropped while backgrounded, kick it to reconnect immediately
    if (!socket.connected && userName) {
      socket.connect();
    }
  }
});

// ── Scroll ────────────────────────────────────────────────────────────────────
function scheduleScroll() {
  if (pendingScrollRaf) return;
  pendingScrollRaf = true;
  requestAnimationFrame(() => {
    chat.scrollTop   = chat.scrollHeight;
    pendingScrollRaf = false;
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function generateMsgId() {
  return `${socket.id}_${++msgCounter}_${Date.now()}`;
}

function formatTimestamp(date) {
  const h    = date.getHours();
  const m    = date.getMinutes();
  const ampm = h >= 12 ? "PM" : "AM";
  const h12  = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, "0")} ${ampm}`;
}

function _appendInfoMessage(text, className, id) {
  const el       = document.createElement("div");
  el.className   = className;
  el.textContent = text;
  if (id) el.id  = id;
  chat.appendChild(el);
  scheduleScroll();
}

function addSystemMessage(text)            { _appendInfoMessage(text, "system-message"); }

// ── System message with an inline image (used for the press-counter hint) ──
function addSystemImageMessage(imgSrc, altText) {
  const el       = document.createElement("div");
  el.className   = "system-message system-message--with-image";

  const img       = document.createElement("img");
  img.src         = imgSrc;
  img.alt         = altText || "";
  img.loading     = "lazy";
  img.style.maxWidth    = "100%";
  img.style.borderRadius = "10px";
  img.style.display     = "block";
  img.style.margin      = "8px auto 0";

  el.appendChild(img);
  chat.appendChild(el);
  scheduleScroll();
}

// ── Partner-found card (avatar + name + status) ─────────────────────────────
function addPartnerFoundCard(name) {
  const card       = document.createElement("div");
  card.className   = "partner-found-card";

  const avatar     = document.createElement("div");
  avatar.className = "pfc-avatar";
  avatar.textContent = (name || "?").charAt(0).toUpperCase();

  const info       = document.createElement("div");
  info.className   = "pfc-info";

  const nameEl       = document.createElement("div");
  nameEl.className   = "pfc-name";
  nameEl.textContent = name;

  const statusEl       = document.createElement("div");
  statusEl.className   = "pfc-status";
  statusEl.textContent = "პარტნიორი ნაპოვნია";

  info.appendChild(nameEl);
  info.appendChild(statusEl);
  card.appendChild(avatar);
  card.appendChild(info);
  chat.appendChild(card);
  scheduleScroll();

  // Load the partner's real profile picture if they're a registered user,
  // otherwise fall back to the default (unregistered) picture.
  const DEFAULT_PARTNER_PIC = "https://raw.githubusercontent.com/miqaeli2003/newgacnoba/master/images%20(1).jpeg";
  fetch("/api/users/avatars", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ usernames: [name] }),
  })
    .then(r => r.json())
    .then(d => {
      const file = d?.avatars?.[(name || "").toLowerCase()];
      avatar.innerHTML = `<img src="${file ? "/" + file : DEFAULT_PARTNER_PIC}" alt="avatar" />`;
    })
    .catch(() => {
      avatar.innerHTML = `<img src="${DEFAULT_PARTNER_PIC}" alt="avatar" />`;
    });
}
function addDisconnectMessage(text)        { _appendInfoMessage(text, "system-message-disconnect"); }
function addReconnectingMessage(name)      {
  document.getElementById("reconnectingMsg")?.remove();
  _appendInfoMessage(
    `${name} - კავშირი გაწყდა, ველოდებით... ⏳`,
    "system-message-reconnecting",
    "reconnectingMsg"
  );
}
function removeReconnectingMessage()       { document.getElementById("reconnectingMsg")?.remove(); }

// ── Searching message with random fact ───────────────────────────────────────
function addSearchingMessage() {
  // Remove any existing searching block
  document.getElementById("searchingMsg")?.remove();
  // Ensure inputs are disabled while searching so user can't type into a non-existent chat
  setInputsEnabled(false);

  const wrapper     = document.createElement("div");
  wrapper.id        = "searchingMsg";
  wrapper.className = "searching-block";

  const searchText       = document.createElement("div");
  searchText.className   = "system-message";
  searchText.textContent = "ვეძებთ ახალ პარტნიორს... 🔎";
  wrapper.appendChild(searchText);

  // Fact card
  const factCard       = document.createElement("div");
  factCard.className   = "fact-card";

  const factLabel       = document.createElement("span");
  factLabel.className   = "fact-label";
  factLabel.textContent = "💡 Random Fact";

  const factText       = document.createElement("span");
  factText.className   = "fact-text";
  factText.textContent = "...";

  // Arrow button — bottom-right corner
  const nextFactBtn       = document.createElement("button");
  nextFactBtn.className   = "fact-next-btn";
  nextFactBtn.title       = "სხვა ფაქტი";
  nextFactBtn.textContent = "→";

  factCard.appendChild(factLabel);
  factCard.appendChild(factText);
  factCard.appendChild(nextFactBtn);
  wrapper.appendChild(factCard);


  
  const warningEl = document.createElement("div");
  warningEl.className = "searching-warning";
  warningEl.textContent = "⚠️ WARNING : გთხოვთ არ ჩაკეცოთ ბრაუზერი";
  wrapper.appendChild(warningEl);

  chat.appendChild(wrapper);
  scheduleScroll();

  function loadFact() {
    nextFactBtn.classList.add("spinning");
    fetch("/api/random-fact")
      .then(r => r.json())
      .then(data => {
        if (data.fact) {
          // Fade out → swap text → fade in
          factText.style.transition = "opacity 0.15s";
          factText.style.opacity    = "0";
          setTimeout(() => {
            factText.textContent      = data.fact;
            factText.style.opacity    = "1";
          }, 150);
        }
      })
      .catch(() => {
        factText.textContent = "ფაქტი ვერ ჩაიტვირთა 😕";
      })
      .finally(() => {
        nextFactBtn.classList.remove("spinning");
      });
  }

  // Load initial fact
  loadFact();

  // Arrow click → load next fact
  nextFactBtn.addEventListener("click", loadFact);
}

function addMessage(text, isYou, messageId, replyToData) {
  const id = messageId || generateMsgId();

  const wrapper         = document.createElement("div");
  wrapper.className     = `message-wrapper ${isYou ? "you" : "partner"}`;
  wrapper.dataset.messageId = id;

  // ── Reply quote block ────────────────────────────────────────────────────
  if (replyToData && replyToData.text) {
    const quote       = document.createElement("div");
    quote.className   = `reply-quote ${isYou ? "you" : "partner"}`;

    if (replyToData.senderName) {
      const quoteName       = document.createElement("span");
      quoteName.className   = "reply-quote-name";
      quoteName.textContent = replyToData.senderName;
      quote.appendChild(quoteName);
    }

    const quoteText       = document.createElement("span");
    quoteText.className   = "reply-quote-text";
    const raw = replyToData.text;
    quoteText.textContent = raw.length > 80 ? raw.slice(0, 80) + "…" : raw;

    quote.appendChild(quoteText);
    wrapper.appendChild(quote);
  }

  const msgRow      = document.createElement("div");
  msgRow.className  = "message-row";

  const content     = document.createElement("div");
  content.className = `message-content${isYou ? " you" : ""}`;
  content.textContent = text;

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp inline-ts";
  timestamp.textContent = formatTimestamp(new Date());

  // ── Reply button ──────────────────────────────────────────────────────────
  const replyBtn     = document.createElement("button");
  replyBtn.className = "reply-btn";
  replyBtn.innerHTML = "↩";
  replyBtn.title     = "Reply";
  replyBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    setReplyTo({
      text,
      senderName: isYou ? userName : (partnerName || "Partner"),
      messageId: id,
    });
  });

  if (isYou) {
    // You: [reply-btn]  [timestamp]  [bubble]
    msgRow.appendChild(replyBtn);
    msgRow.appendChild(timestamp);
    msgRow.appendChild(content);
  } else {
    // Partner: [bubble]  [react-btn]  [reply-btn]  [timestamp]
    const reactBtn     = document.createElement("button");
    reactBtn.className = "react-btn";
    reactBtn.innerHTML = "🙂";
    reactBtn.title     = "React";
    reactBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showReactionPicker(reactBtn, id);
    });
    msgRow.appendChild(content);
    msgRow.appendChild(reactBtn);
    msgRow.appendChild(replyBtn);
    msgRow.appendChild(timestamp);
  }

  const reactionArea    = document.createElement("div");
  reactionArea.className = "reaction-area";
  reactionArea.id       = `reactions_${id}`;

  wrapper.appendChild(msgRow);
  wrapper.appendChild(reactionArea);

  // Seen indicator — only for messages you sent
  if (isYou) {
    const seen       = document.createElement("div");
    seen.className   = "seen-status";
    seen.id          = `seen_${id}`;
    seen.textContent = "✓";
    wrapper.appendChild(seen);
  }

  chat.appendChild(wrapper);
  scheduleScroll();
  return id;
}

function addGifMessage(gifUrl, isYou) {
  const wrapper     = document.createElement("div");
  wrapper.className = `message-wrapper gif-msg-wrapper ${isYou ? "you" : "partner"}`;

  const img       = document.createElement("img");
  img.src         = gifUrl;
  img.className   = "gif-message-img";
  img.loading     = "lazy";
  img.decoding    = "async";

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  wrapper.appendChild(img);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  scheduleScroll();
}

// ── Photo message ────────────────────────────────────────────────────────────
function addPhotoMessage(dataUrl, isYou) {
  const wrapper     = document.createElement("div");
  wrapper.className = `message-wrapper photo-msg-wrapper ${isYou ? "you" : "partner"}`;

  const inner       = document.createElement("div");
  inner.className   = "photo-wrapper-inner";

  const img         = document.createElement("img");
  img.src           = dataUrl;
  img.className     = "photo-message-img" + (isYou ? "" : " blurred");
  img.loading       = "lazy";
  img.decoding      = "async";

  inner.appendChild(img);

  if (!isYou) {
    const overlay   = document.createElement("div");
    overlay.className = "photo-blur-overlay";
    const hint      = document.createElement("span");
    
    hint.textContent = "👁 სანახავად დააჭირე";
    overlay.appendChild(hint);
    inner.appendChild(overlay);

    let isUnblurred = false;

    img.addEventListener("click", () => {
      if (!isUnblurred) {
        // First click: Unblur the image in chat
        img.classList.remove("blurred");
        overlay.remove();
        isUnblurred = true;
        // Update hint to show fullscreen is available
        const newHint = document.createElement("span");
        newHint.className = "photo-blur-hint";
        inner.appendChild(newHint);
      } else {
        // Second click: Open fullscreen
        showPhotoFullscreen(dataUrl);
      }
    });
  } else {
    // Your own photos open fullscreen directly
    img.addEventListener("click", () => {
      showPhotoFullscreen(dataUrl);
    });
  }

  const timestamp       = document.createElement("div");
  timestamp.className   = "timestamp";
  timestamp.textContent = formatTimestamp(new Date());

  wrapper.appendChild(inner);
  wrapper.appendChild(timestamp);
  chat.appendChild(wrapper);
  scheduleScroll();
}

// ── Question card ─────────────────────────────────────────────────────────────
function addQuestionCard(questionText, isYou) {
  const card       = document.createElement("div");
  card.className   = `question-card ${isYou ? "you" : "partner"}`;

  const label      = document.createElement("div");
  label.className  = "question-card-label";
  label.textContent = isYou ? "❓ შენ გამოგზავნე კითხვა" : `❓ ${partnerName || "პარტნიორი"} გიგზავნის კითხვას`;

  const text       = document.createElement("div");
  text.className   = "question-card-text";
  text.textContent = questionText;

  const ts         = document.createElement("div");
  ts.className     = "timestamp";
  ts.textContent   = formatTimestamp(new Date());

  card.appendChild(label);
  card.appendChild(text);
  card.appendChild(ts);
  chat.appendChild(card);
  scheduleScroll();
}

// ── Typing indicator (inline chat bubble) ──────────────────────────────────
// Rendered as a real message-list entry, styled like a partner bubble, sitting
// wherever the partner's next message will land. hideTypingIndicator() removes
// it outright, so the real message (added right after) drops into that spot.

function showTypingIndicator() {
  if (document.getElementById("liveTypingBubble")) return; // already showing
  const el     = document.createElement("div");
  el.id        = "liveTypingBubble";
  el.className = "typing-indicator";
  el.innerHTML = "<span></span><span></span><span></span>";
  chat.appendChild(el); // sits in the message flow, right where the partner's next message will land
  scheduleScroll();
}

function hideTypingIndicator() {
  const el = document.getElementById("liveTypingBubble");
  if (el) el.remove();
}

function clearChat() { chat.innerHTML = ""; clearReply(); }

// ── Floating "go to start of chat" button ───────────────────────────────────
function showScrollToTopBtn() { if (scrollToTopBtn) scrollToTopBtn.style.display = "flex"; }
if (scrollToTopBtn) {
  scrollToTopBtn.addEventListener("click", () => {
    chat.scrollTo({ top: 0, behavior: "smooth" });
  });
}

// Stub — countdown was removed but the call site still references this
function clearPartnerAwayCountdown() {}

function updateOnlineCount(count) {
  onlineCountEl.textContent = `Users: ${count + 30}`;
}

// ── Reply helpers ──────────────────────────────────────────────────────────────
function setReplyTo({ text, senderName, messageId }) {
  replyTo = { text, senderName, messageId };
  replyPreviewName.textContent = senderName;
  replyPreviewText.textContent = text.length > 80 ? text.slice(0, 80) + "…" : text;
  replyPreview.style.display = "flex";
  messageInput.focus();
}

function clearReply() {
  replyTo = null;
  replyPreview.style.display = "none";
  replyPreviewName.textContent = "";
  replyPreviewText.textContent = "";
}

replyPreviewClose.addEventListener("click", () => clearReply());

function setInputsEnabled(enabled) {
  messageInput.disabled   = !enabled;
  messageInput.readOnly   = !enabled;
  messageInput.style.pointerEvents = enabled ? "" : "none";
  sendBtn.disabled        = !enabled;
  gifBtn.disabled         = !enabled;
  if (photoBtn) photoBtn.disabled = !enabled;
  questionBtn.disabled    = !enabled;
  if (!enabled) {
    // Clear any text typed during a race (e.g. keyboard still open while searching)
    messageInput.value = "";
    messageInput.style.height = "auto";
    charCount.textContent = "";
    charCount.classList.remove("warning");
    messageInput.blur();
  }
  // blockBtn is managed separately via updateBlockBtn()
}

// Block button is enabled when chatting OR when partner just left normally.
// Report button is enabled when chatting OR when partner just disconnected.
// It stays disabled during the reconnecting grace-period.
function updateBlockBtn() {
  blockBtn.disabled  = !(partnerConnected || canBlockDisconnected);
  if (reportBtn) reportBtn.disabled = !(partnerConnected || canBlockDisconnected);
}

function setPartnerNameDisplay(name) {
  const el = document.getElementById("partnerNameDisplay");
  if (!el) return;
  if (name) {
    el.textContent = `👤 ${name}`;
    el.style.opacity = "1";
    el.style.color = "";
  } else {
    el.textContent = "👤 ---";
    el.style.opacity = "0.25";
  }
}

function showNameError(msg) {
  nameError.textContent   = msg;
  nameError.style.display = "block";
  const _ov = document.getElementById("modalLoadingOverlay");
  if (_ov) _ov.style.display = "none";
  nameInput.classList.add("error");
}

function clearNameError() {
  nameError.textContent   = "";
  nameError.style.display = "none";
  nameInput.classList.remove("error");
}

// ── Toast popup — used for name-change confirmation ───────────────────────────
function showToast(text, duration = 3000) {
  document.querySelectorAll(".toast-popup").forEach(t => t.remove());
  const toast       = document.createElement("div");
  toast.className   = "toast-popup";
  toast.textContent = text;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add("toast-visible"));
  setTimeout(() => {
    toast.classList.remove("toast-visible");
    setTimeout(() => toast.remove(), 350);
  }, duration);
}

// ── Search retry ──────────────────────────────────────────────────────────────
// No client-side polling needed. The server's tryFindPartner() already queues
// the socket and pairs it automatically when a match arrives. All call sites
// that used startSearchRetry() are now no-ops so they compile safely.
function startSearchRetry() { /* no-op — server handles pairing */ }

function stopSearchRetry() {
  if (searchRetryInterval !== null) {
    clearInterval(searchRetryInterval);
    searchRetryInterval = null;
  }
}

// ── GIF Picker ────────────────────────────────────────────────────────────────
const TENOR_PROXY = "/api/gifs"; // key stays on the server

async function fetchGifs(query) {
  if (gifFetchController) gifFetchController.abort();
  gifFetchController = new AbortController();
  gifResults.innerHTML = '<div class="gif-placeholder">Loading...</div>';

  try {
    const url  = query ? `${TENOR_PROXY}?q=${encodeURIComponent(query)}` : TENOR_PROXY;
    const res  = await fetch(url, { signal: gifFetchController.signal });
    const data = await res.json();
    renderGifResults(data.results || []);
  } catch (err) {
    if (err.name !== "AbortError") {
      gifResults.innerHTML = '<div class="gif-placeholder">Failed to load GIFs 😢</div>';
    }
  } finally {
    gifFetchController = null;
  }
}

function renderGifResults(results) {
  const frag = document.createDocumentFragment();
  if (!results.length) {
    const ph = document.createElement("div");
    ph.className = "gif-placeholder";
    ph.textContent = "No GIFs found";
    gifResults.innerHTML = "";
    gifResults.appendChild(ph);
    return;
  }
  const col1 = document.createElement("div");
  const col2 = document.createElement("div");
  col1.className = "gif-col";
  col2.className = "gif-col";
  results.forEach((result, i) => {
    const media      = result.media[0];
    const previewUrl = media.tinygif?.url || media.gif?.url;
    const fullUrl    = media.gif?.url;
    if (!previewUrl || !fullUrl) return;
    const img        = document.createElement("img");
    img.src          = previewUrl;
    img.className    = "gif-item";
    img.loading      = "lazy";
    img.decoding     = "async";
    img.addEventListener("click", () => sendGif(fullUrl, previewUrl));
    (i % 2 === 0 ? col1 : col2).appendChild(img);
  });
  frag.appendChild(col1);
  frag.appendChild(col2);
  gifResults.innerHTML = "";
  gifResults.appendChild(frag);
}

// ── Visual Viewport — drives BOTH the input bar and GIF picker ────────────────
// On iOS Safari the keyboard (+ its accessory bar) shrinks the visual viewport
// but NOT the layout viewport, so position:fixed elements stay hidden behind it.
// We read the gap and push everything up by exactly that amount — the same trick
// Instagram uses so their input sits flush above the keyboard with no extra bar.
const chatInputBar = document.querySelector(".chat-input");

function getKeyboardHeight() {
  if (!window.visualViewport) return 0;
  const vv = window.visualViewport;
  return Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
}

function updateViewportOffsets() {
  const vv  = window.visualViewport;
  const kbH = getKeyboardHeight();

  // ── iOS Safari: use the actual visual-viewport height to clamp the body ──
  // This prevents the layout from overflowing when the address bar is visible.
  document.body.style.height = kbH > 0 ? vv.height + "px" : "";

  // Toggle a class so CSS can zoom out messages slightly when keyboard is open.
  // Use a small threshold (> 80) to avoid triggering on iOS toolbar-resize jitter.
  document.body.classList.toggle("keyboard-open", kbH > 80);

  // Input bar is position:fixed (layout-viewport coords) so it needs shifting
  // up by the full keyboard height (Safari accessory bar included).
  // When keyboard is closed, reset to 0 so CSS env(safe-area-inset-bottom) takes over.
  chatInputBar.style.bottom     = kbH > 0 ? kbH + "px" : "";
  chatInputBar.style.transition = kbH === 0 ? "bottom 0.22s ease" : "none";

  // GIF picker: bottom sheet sits flush above keyboard
  if (gifPickerOpen) {
    gifPicker.style.bottom = kbH + "px";
  }

  // Pin scroll to bottom whenever the viewport shifts
  scheduleScroll();
}

if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", updateViewportOffsets, { passive: true });
  window.visualViewport.addEventListener("scroll", updateViewportOffsets, { passive: true });
  // Run once on load so the input bar and chat area start at the right position
  // (important on iOS where env(safe-area-inset-bottom) must be applied early)
  updateViewportOffsets();
} else {
  // Fallback for very old iOS Safari that doesn't support visualViewport
  window.addEventListener("resize", updateViewportOffsets, { passive: true });
}

function updateGifPickerPosition() {
  if (!gifPickerOpen) return;
  const kbH = getKeyboardHeight();
  gifPicker.style.bottom = kbH + "px";
}

function openGifPicker() {
  const kbH = getKeyboardHeight();
  gifPicker.style.display = "flex";
  // Force reflow so the transition fires from off-screen position
  gifPicker.getBoundingClientRect();
  gifPicker.style.bottom = kbH + "px";
  gifPickerOpen = true;
  gifSearch.value = "";
  gifSearch.focus();
  fetchGifs("");
}

function closeGifPickerPanel() {
  gifPicker.style.bottom = "-100%";
  gifPickerOpen = false;
  // Hide after slide-out animation
  setTimeout(() => {
    if (!gifPickerOpen) gifPicker.style.display = "none";
  }, 300);
}

gifBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  gifPickerOpen ? closeGifPickerPanel() : openGifPicker();
});

gifPickerClose.addEventListener("click", (e) => { e.stopPropagation(); closeGifPickerPanel(); });

gifSearch.addEventListener("input", () => {
  clearTimeout(gifSearchTimer);
  gifSearchTimer = setTimeout(() => fetchGifs(gifSearch.value.trim()), 400);
});

gifSearch.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") e.preventDefault();
});

document.addEventListener("click", (e) => {
  if (gifPickerOpen && !gifPicker.contains(e.target) && e.target !== gifBtn) {
    closeGifPickerPanel();
  }
});

function sendGif(fullUrl, previewUrl) {
  if (!partnerConnected) return;
  socket.emit("gif", { url: fullUrl, preview: previewUrl });
  addGifMessage(fullUrl, true);
  closeGifPickerPanel();
}

socket.on("gif", (data) => addGifMessage(data.url, false));

// ── Photo send ────────────────────────────────────────────────────────────────

if (photoBtn) {
  photoBtn.addEventListener("click", () => {
    // Show inline confirmation in chat
    const existing = document.getElementById("cameraConfirmEl");
    if (existing) { existing.remove(); return; }

    const confirmEl = document.createElement("div");
    confirmEl.id = "cameraConfirmEl";
    confirmEl.className = "block-offer";
    confirmEl.style.borderColor = "rgba(88,101,242,0.4)";
    confirmEl.style.background = "rgba(88,101,242,0.07)";
    confirmEl.innerHTML =
      `<span style="color:#dcddde;font-size:0.95em;">🖼️ გსურთ კამერის გახსნა?</span>` +
      `<div style="display:flex;gap:8px;margin-top:4px;">` +
        `<button id="cameraYesBtn" class="block-offer-btn" style="background:linear-gradient(135deg,#5865f2,#3b44c0);padding:6px 20px;">კი</button>` +
        `<button id="cameraNoBtn" class="block-offer-btn" style="background:rgba(255,255,255,0.08);color:#aaa;padding:6px 20px;">არა</button>` +
      `</div>`;
    chat.appendChild(confirmEl);
    scheduleScroll();

    document.getElementById("cameraYesBtn").addEventListener("click", () => {
      confirmEl.remove();
      if (photoInput) photoInput.click();
    });
    document.getElementById("cameraNoBtn").addEventListener("click", () => {
      confirmEl.remove();
    });
  });
}

// ── Photo Permission Request Dialog (for partner to approve) ────────────────
function showPhotoPermissionDialog(message, onApprove, onDecline) {
  const modal = document.createElement("div");
  modal.className = "photo-permission-modal";
  
  const backdrop = document.createElement("div");
  backdrop.className = "photo-permission-backdrop";
  
  const content = document.createElement("div");
  content.className = "photo-permission-content";
  
  const icon = document.createElement("div");
  icon.className = "photo-permission-icon";
  icon.textContent = "📸";
  
  const text = document.createElement("p");
  text.className = "photo-permission-text";
  text.textContent = message;
  
  const buttonGroup = document.createElement("div");
  buttonGroup.className = "photo-permission-buttons";
  
  const declineBtn = document.createElement("button");
  declineBtn.className = "photo-permission-btn decline";
  declineBtn.textContent = "უარი";
  declineBtn.onclick = () => {
    modal.remove();
    onDecline();
  };
  
  const approveBtn = document.createElement("button");
  approveBtn.className = "photo-permission-btn approve";
  approveBtn.textContent = "დამტკიცება";
  approveBtn.onclick = () => {
    modal.remove();
    onApprove();
  };
  
  buttonGroup.appendChild(declineBtn);
  buttonGroup.appendChild(approveBtn);
  
  content.appendChild(icon);
  content.appendChild(text);
  content.appendChild(buttonGroup);
  
  backdrop.appendChild(content);
  modal.appendChild(backdrop);
  
  document.body.appendChild(modal);
}

// ── Report Reason Modal ──────────────────────────────────────────────────────
function showReportReasonModal(targetName, onSubmit) {
  const modal = document.createElement("div");
  modal.className = "photo-confirm-modal";

  const backdrop = document.createElement("div");
  backdrop.className = "photo-confirm-backdrop";

  const content = document.createElement("div");
  content.className = "photo-confirm-content";

  const title = document.createElement("p");
  title.className = "photo-confirm-title";
  title.textContent = `რატომ მოახსენებთ "${targetName}"-ს?`;

  const textarea = document.createElement("textarea");
  textarea.className = "report-reason-textarea";
  textarea.placeholder = "მიუთითეთ მიზეზი (სავალდებულოა)...";
  textarea.maxLength = 200;

  const errorMsg = document.createElement("p");
  errorMsg.className = "report-reason-error";
  errorMsg.textContent = "გთხოვთ, მიუთითოთ მიზეზი.";
  errorMsg.style.display = "none";

  const buttonGroup = document.createElement("div");
  buttonGroup.className = "photo-confirm-buttons";

  const cancelBtn = document.createElement("button");
  cancelBtn.className = "photo-confirm-btn cancel";
  cancelBtn.textContent = "გაუქმება";
  cancelBtn.onclick = () => modal.remove();

  const confirmBtn = document.createElement("button");
  confirmBtn.className = "photo-confirm-btn confirm";
  confirmBtn.textContent = "🚩 გაგზავნა";
  confirmBtn.onclick = () => {
    const reason = textarea.value.trim();
    if (reason.length < 3) {
      errorMsg.style.display = "block";
      textarea.focus();
      return;
    }
    modal.remove();
    onSubmit(reason);
  };

  textarea.addEventListener("input", () => { errorMsg.style.display = "none"; });

  buttonGroup.appendChild(cancelBtn);
  buttonGroup.appendChild(confirmBtn);

  content.appendChild(title);
  content.appendChild(textarea);
  content.appendChild(errorMsg);
  content.appendChild(buttonGroup);

  backdrop.appendChild(content);
  modal.appendChild(backdrop);

  document.body.appendChild(modal);
  setTimeout(() => textarea.focus(), 50);
}


function showPhotoConfirmation(dataUrl, onConfirm) {
  const modal = document.createElement("div");
  modal.className = "photo-confirm-modal";
  
  const backdrop = document.createElement("div");
  backdrop.className = "photo-confirm-backdrop";
  
  const content = document.createElement("div");
  content.className = "photo-confirm-content";
  
  const title = document.createElement("p");
  title.className = "photo-confirm-title";
  title.textContent = "გსურთ ამ სურათის გაგზავნა?";
  
  const preview = document.createElement("img");
  preview.className = "photo-confirm-preview";
  preview.src = dataUrl;
  
  const buttonGroup = document.createElement("div");
  buttonGroup.className = "photo-confirm-buttons";
  
  const cancelBtn = document.createElement("button");
  cancelBtn.className = "photo-confirm-btn cancel";
  cancelBtn.textContent = "გაუქმება";
  cancelBtn.onclick = () => modal.remove();
  
  const confirmBtn = document.createElement("button");
  confirmBtn.className = "photo-confirm-btn confirm";
  confirmBtn.textContent = "გაგზავნა";
  confirmBtn.onclick = () => {
    modal.remove();
    onConfirm();
  };
  
  buttonGroup.appendChild(cancelBtn);
  buttonGroup.appendChild(confirmBtn);
  
  content.appendChild(title);
  content.appendChild(preview);
  content.appendChild(buttonGroup);
  
  backdrop.appendChild(content);
  modal.appendChild(backdrop);
  
  document.body.appendChild(modal);
}

// ── Photo Fullscreen Modal ───────────────────────────────────────────────────
function showPhotoFullscreen(dataUrl) {
  const modal = document.createElement("div");
  modal.className = "photo-fullscreen-modal";
  
  const backdrop = document.createElement("div");
  backdrop.className = "photo-fullscreen-backdrop";
  
  const closeBtn = document.createElement("button");
  closeBtn.className = "photo-fullscreen-close";
  closeBtn.innerHTML = "✕";
  closeBtn.onclick = () => modal.remove();
  
  const img = document.createElement("img");
  img.className = "photo-fullscreen-img";
  img.src = dataUrl;
  
  backdrop.appendChild(img);
  backdrop.appendChild(closeBtn);
  modal.appendChild(backdrop);
  
  document.body.appendChild(modal);
  
  // Close on backdrop click
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) modal.remove();
  });
}

// Compress + resize image to fit within socket buffer
function compressImage(file, callback) {
  const MAX_DIM     = 1280;  // max width or height
  const QUALITY     = 0.82;  // JPEG quality
  const MAX_B64_LEN = 2.8 * 1024 * 1024; // ~2MB file after base64

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      // Scale down if needed
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else                { width  = Math.round(width  * MAX_DIM / height); height = MAX_DIM; }
      }
      const canvas = document.createElement("canvas");
      canvas.width  = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);

      // Try JPEG first, fall back to lower quality if still too large
      let dataUrl = canvas.toDataURL("image/jpeg", QUALITY);
      if (dataUrl.length > MAX_B64_LEN) {
        dataUrl = canvas.toDataURL("image/jpeg", 0.65);
      }
      if (dataUrl.length > MAX_B64_LEN) {
        dataUrl = canvas.toDataURL("image/jpeg", 0.45);
      }
      callback(dataUrl);
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

let pendingPhotoData = null; // Store pending photo waiting for approval

if (photoInput) {
  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    photoInput.value = ""; // reset so same file can be re-sent
    if (!file) return;
    if (!partnerConnected) return; // guard: don't send if no partner
    if (!file.type.startsWith("image/")) {
      addSystemMessage("⚠️ მხოლოდ სურათების გაგზავნაა შესაძლებელი.");
      return;
    }
    compressImage(file, (dataUrl) => {
      if (!partnerConnected) return; // recheck after async compress
      
      // Store the photo and ask partner for permission
      pendingPhotoData = dataUrl;
      socket.emit("photo:request", { fromId: socket.id });
      addSystemMessage("📸 სურათის გაგზავნის მოთხოვნა შეთავაზებულია...");
    });
  });
}

// Listen for photo permission request from partner
socket.on("photo:request", ({ fromId }) => {
  showPhotoPermissionDialog(
    "პარტნიორი გიგზავნით ფოტოს , გსურთ ნახვა?",
    () => {
      // Partner accepted - send approval
      socket.emit("photo:approved", { toId: fromId });
    },
    () => {
      // Partner declined - send rejection
      socket.emit("photo:declined", { toId: fromId });
    }
  );
});

// Listen for approval from partner
socket.on("photo:approved", () => {
  if (pendingPhotoData) {
    socket.emit("photo", { dataUrl: pendingPhotoData });
    addPhotoMessage(pendingPhotoData, true);
    addSystemMessage("✅ პარტნიორმა დაამტკიცა სურათის მიღება");
    pendingPhotoData = null;
  }
});

// Listen for rejection from partner
socket.on("photo:declined", () => {
  pendingPhotoData = null;
  addSystemMessage("❌ პარტნიორმა უარყო სურათის მიღება");
});

socket.on("photo", (data) => {
  if (data?.dataUrl) addPhotoMessage(data.dataUrl, false);
});

// ── Question button ───────────────────────────────────────────────────────────
let questionBtnCooldown = false;

questionBtn.addEventListener("click", async () => {
  if (!partnerConnected || questionBtnCooldown) return;
  questionBtnCooldown = true;
  questionBtn.disabled = true;
  questionBtn.textContent = "⌛";

  try {
    const res  = await fetch("/api/random-question");
    const data = await res.json();
    if (data.question) {
      // Show question card locally for you
      addQuestionCard(data.question, true);
      // Relay to partner via socket
      socket.emit("sendQuestion", { text: data.question });
    }
  } catch {
    addSystemMessage("კითხვა ვერ ჩაიტვირთა 😕");
  } finally {
    setTimeout(() => {
      questionBtnCooldown  = false;
      questionBtn.disabled = !partnerConnected;
      questionBtn.textContent = "?";
    }, 3000); // 3 s cooldown
  }
});

// Partner received a question card from us
socket.on("partnerQuestion", ({ text }) => {
  addQuestionCard(text, false);
  playNotification("message");
  incrementUnread();
});

// ── Reactions ─────────────────────────────────────────────────────────────────
const REACTIONS          = ["❤️","😂","😢"];
let activeReactionPicker = null;

function showReactionPicker(anchorEl, messageId) {
  closeReactionPicker();
  const picker      = document.createElement("div");
  picker.className  = "reaction-picker";
  const frag = document.createDocumentFragment();
  REACTIONS.forEach(emoji => {
    const btn       = document.createElement("button");
    btn.className   = "reaction-emoji-btn";
    btn.textContent = emoji;
    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      reactToMessage(messageId, emoji);
      closeReactionPicker();
    });
    frag.appendChild(btn);
  });
  picker.appendChild(frag);
  document.body.appendChild(picker);
  activeReactionPicker = picker;
  requestAnimationFrame(() => {
    const rect = anchorEl.getBoundingClientRect();
    const pw = picker.offsetWidth, ph = picker.offsetHeight;
    let left = rect.left, top = rect.top - ph - 8;
    if (left + pw > window.innerWidth - 8) left = window.innerWidth - pw - 8;
    if (top < 4) top = rect.bottom + 8;
    picker.style.cssText += `left:${left}px;top:${top}px;opacity:1;transform:scale(1)`;
  });
}

function closeReactionPicker() {
  activeReactionPicker?.remove();
  activeReactionPicker = null;
}

document.addEventListener("click", () => closeReactionPicker());

function reactToMessage(messageId, emoji) {
  socket.emit("react", { messageId, emoji });
  displayReaction(messageId, emoji, true);
}

function displayReaction(messageId, emoji, isMine) {
  const area = document.getElementById(`reactions_${messageId}`);
  if (!area) return;
  const cls = isMine ? "reaction-mine" : "reaction-partner";
  let pill   = area.querySelector(`.${cls}`);
  if (pill) {
    pill.classList.remove("reaction-pop");
    void pill.offsetWidth;
    pill.textContent = emoji;
    pill.classList.add("reaction-pop");
  } else {
    pill = document.createElement("span");
    pill.className   = `reaction-pill ${cls} reaction-pop`;
    pill.textContent = emoji;
    area.appendChild(pill);
  }
}

// ── Message sending ───────────────────────────────────────────────────────────
function sendMessage() {
  const message = messageInput.value.trim();
  if (!message) return;
  // Guard every possible way the chat can be in a non-connected state
  if (!partnerConnected || !userName) return;
  if (messageInput.disabled || messageInput.readOnly) return;
  if (!socket.connected) return; // don't queue messages if socket is down
  const msgId = generateMsgId();
  const currentReply = replyTo ? { ...replyTo } : null;
  addMessage(message, true, msgId, currentReply);
  socket.emit("message", { text: message, messageId: msgId, replyTo: currentReply });
  messageInput.value = "";
  messageInput.style.height = "auto";
  messageInput.style.overflowY = "hidden";
  charCount.textContent = "";
  charCount.classList.remove("warning");
  clearReply();
  // Keep focus on input so the keyboard stays open on mobile
  messageInput.focus();
}

// ── Bio / Interests popup ─────────────────────────────────────────────────────
let bioPopupOpen = false;

function openBioPopup() {
  bioInput.value       = userBio;
  bioCharCount.textContent = `${userBio.length}/60`;
  bioPopup.style.display = "flex";
  bioPopupOpen = true;
  setTimeout(() => bioInput.focus(), 50);
}

function closeBioPopup() {
  bioPopup.style.display = "none";
  bioPopupOpen = false;
}

interestsBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  bioPopupOpen ? closeBioPopup() : openBioPopup();
});

bioInput.addEventListener("input", () => {
  bioCharCount.textContent = `${bioInput.value.length}/60`;
});

bioInput.addEventListener("keydown", (e) => {
  e.stopPropagation();
  if (e.key === "Enter") { e.preventDefault(); saveBio(); }
  if (e.key === "Escape") closeBioPopup();
});

function saveBio() {
  const text = bioInput.value.trim().slice(0, 60);
  userBio = text;
  socket.emit("setBio", text);
  interestsBtn.classList.toggle("has-bio", text.length > 0);
  closeBioPopup();
  if (text) showToast("✅ ინფო შენახულია!");
}

function clearBio() {
  bioInput.value = "";
  bioCharCount.textContent = "0/60";
  userBio = "";
  socket.emit("setBio", "");
  interestsBtn.classList.remove("has-bio");
}

bioSaveBtn.addEventListener("click", saveBio);
bioClearBtn.addEventListener("click", clearBio);
document.getElementById("bioCloseBtn").addEventListener("click", (e) => { e.stopPropagation(); closeBioPopup(); });

// Close popup when clicking outside it
document.addEventListener("click", (e) => {
  if (bioPopupOpen && !bioPopup.contains(e.target) && e.target !== interestsBtn) {
    closeBioPopup();
  }
});

// ── Name modal ────────────────────────────────────────────────────────────────
let _saveNameTimeout = null; // tracks the freeze-recovery timer

function _resetSaveBtn() {
  clearTimeout(_saveNameTimeout);
  _saveNameTimeout        = null;
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = isFirstLogin ? "საუბრის დაწყება" : "Save Name";
  const _ov = document.getElementById("modalLoadingOverlay");
  if (_ov) _ov.style.display = "none";
}

function saveName() {
  const name = nameInput.value.trim();
  if (!name)            { showNameError("შეიყვანეთ სახელი ..."); return; }
  if (name.length < 2)  { showNameError("სახელი უნდა შედგებოდეს მინიმუმ ორი სიმბოლოსგან!"); return; }
  if (name.length > 20) { showNameError("20 სიმბოლოზე მეტი ვერ იქნება სახელი ! "); return; }
  clearNameError();

  // If socket isn't connected yet, don't freeze — show a clear error
  if (!socket.connected) {
    showNameError("იტვირთება საიტი, კიდევ სცადეთ 🔄");
    return;
  }

  saveNameBtn.disabled    = true;
  saveNameBtn.textContent = "Checking...";

  // Show loading overlay to blur the form content
  const _overlay = document.getElementById("modalLoadingOverlay");
  if (_overlay) _overlay.style.display = "flex";

  // ── Token not ready yet (slow network on page load) ──────────────────────
  // Re-fetch and retry once rather than sending null and getting a tokenInvalid loop
  if (!_challengeToken || !_challengePow) {
    fetch("/api/challenge")
      .then(r => r.json())
      .then(d => {
        _challengeToken = d.token;
        _challengePow   = (d.nonce * 31 + d.nonce % 97);
        _doSetName(name);
      })
      .catch(() => {
        showNameError("კავშირის შეცდომა. გთხოვთ გვერდი განაახლოთ.");
        _resetSaveBtn();
      });
    return;
  }

  _doSetName(name);
}

function _doSetName(name) {
  // Safety timeout — re-enable button if server never replies within 8 s
  clearTimeout(_saveNameTimeout);
  _saveNameTimeout = setTimeout(() => {
    showNameError("სერვერი არ პასუხობს. სცადეთ ხელახლა. 🔄");
    _resetSaveBtn();
  }, 8000);

  socket.emit("setName", {
    name,
    token:     _challengeToken,
    powAnswer: _challengePow,
    webdriver: !!navigator.webdriver,
  });
}

// ── Socket events ─────────────────────────────────────────────────────────────

socket.on("connect", () => {
  _reconnectNameRetries = 0; // reset on every fresh connect
  // Only silently re-auth if the user was already in an active chat (partnerConnected or was searching)
  // Never auto-setName on a fresh page load — user must press the button.
  if (userName && !isFirstLogin && isReconnecting) {
    // Hide the name modal — silently reconnecting, not asking for a new name
    if (nameModal) nameModal.style.display = "none";
    // Fetch a fresh token — the previous one was one-time-use and already consumed
    fetch("/api/challenge")
      .then(r => r.json())
      .then(d => {
        _challengeToken = d.token;
        _challengePow   = (d.nonce * 31 + d.nonce % 97);
        socket.emit("setName", { name: userName, token: _challengeToken, powAnswer: _challengePow });
      })
      .catch(() => {
        socket.emit("setName", { name: userName, token: "", powAnswer: 0 });
      });
  }
});

// Challenge token was missing or expired — silently re-fetch and retry
socket.on("tokenInvalid", () => {
  fetch("/api/challenge")
    .then(r => r.json())
    .then(d => {
      _challengeToken = d.token;
      _challengePow   = (d.nonce * 31 + d.nonce % 97);
      const name = userName || nameInput.value.trim();
      if (name) {
        socket.emit("setName", { name, token: _challengeToken, powAnswer: _challengePow });
      }
    })
    .catch(() => {
      if (!isReconnecting) {
        showNameError("კავშირის შეცდომა. გთხოვთ გვერდი განაახლოთ.");
        saveNameBtn.disabled    = false;
        saveNameBtn.textContent = isFirstLogin ? "საუბრის დაწყება" : "Save Name";
      }
    });
});

socket.on("nameAccepted", (acceptedName) => {
  const wasNameChange = !isFirstLogin && !isReconnecting;
  _resetSaveBtn(); // cancel the 8-second safety timeout and re-enable button
  userName                = acceptedName;
  nameModal.style.display = "none";
  clearNameError();

  // Do NOT persist username — we never want auto-reconnect on page reload.
  // User must always press the button themselves.

  // Show the username in the top bar
  const displayEl = document.getElementById("userNameDisplay");
  if (displayEl) {
    displayEl.textContent = `👤 ${acceptedName}`;
    displayEl.style.display = "block";
  }

  // Show interests/bio button
  if (interestsBtn) interestsBtn.style.display = "inline-block";

  if (isFirstLogin) {
    isFirstLogin = false;
    clearChat();
    // Do NOT auto-search — user must press the Search button manually
    addSystemMessage("🔎 ძებნის დასაწყებად დააჭირეთ ღილაკს");
    addSystemMessage("ბლოკისა და ძებნის ღილაკებზე მოცემული რიცხვები 🔴🔵 მიუთითებს, რამდენი კლიკი დაგრჩათ რეკლამის გამოჩენამდე. ბოდიშს გიხდით შექმნილი დისკომფორტისთვის.");
    addSystemImageMessage(PRESS_COUNTER_HINT_IMG, "ბლოკი და ძებნა ღილაკები რიცხვებით");
  } else if (isReconnecting) {
    isReconnecting = false;
    _reconnectNameRetries = 0; // reset retry counter on success
    removeReconnectingMessage();
    // Keep inputs and chat as-is — server follows with partnerRestored or partnerDisconnected
  }
  // else: mid-session name change — no extra action
  if (wasNameChange) {
    addSystemMessage(`🟢 თქვენ წარმატებით შეიცვალეთ სახელი „${acceptedName}" 🟢`);
  }
});

// Tracks how many times we've retried the original name after a reconnect collision
let _reconnectNameRetries = 0;
const _RECONNECT_NAME_MAX_RETRIES = 5;

socket.on("nameTaken", () => {
  saveNameBtn.disabled    = false;
  saveNameBtn.textContent = isFirstLogin ? "საუბრის დაწყება" : "Save Name";

  if (isReconnecting) {
    // The server still has our old socket registered under our name.
    // Wait a short moment and retry with the SAME original name — the old
    // socket entry will be cleaned up within a second or two.
    if (_reconnectNameRetries < _RECONNECT_NAME_MAX_RETRIES) {
      _reconnectNameRetries++;
      const delay = 800 + _reconnectNameRetries * 400; // back off slightly each attempt
      setTimeout(() => {
        if (!socket.connected) return; // don't retry if socket dropped again
        const originalName = userName || nameInput.value.trim();
        fetch("/api/challenge")
          .then(r => r.json())
          .then(d => {
            _challengeToken = d.token;
            _challengePow   = (d.nonce * 31 + d.nonce % 97);
            socket.emit("setName", { name: originalName, token: _challengeToken, powAnswer: _challengePow });
          })
          .catch(() => {
            // Network error — give up silently, user is still logged in with old name
            isReconnecting = false;
            _reconnectNameRetries = 0;
          });
      }, delay);
      return; // still reconnecting — do not reset isReconnecting yet
    }

    // Exhausted retries — name is genuinely taken by someone else.
    // Keep the user's existing session intact without renaming them.
    isReconnecting = false;
    _reconnectNameRetries = 0;
    // Don't show modal or change name — just continue as-is
    return;
  }

  _reconnectNameRetries = 0;
  isReconnecting = false;
  showNameError("ეს სახელი დაკავებულია. სხვა აირჩიეთ. 😟 ");
  nameInput.focus();
  nameInput.select();
});

socket.on("onlineCount", (count) => updateOnlineCount(count));

socket.on("queuePosition", ({ position, total }) => {
  const wrapper = document.getElementById("searchingMsg");
  if (wrapper) {
    const msg = wrapper.querySelector(".system-message");
    if (msg) msg.textContent = `ვეძებთ ახალ პარტნიორს... 🔎 `;
  }
});

socket.on("partnerFound", (partner) => {
  // ── Stop everything searching-related immediately ──────────────────────
  stopSearchRetry();
  // Abort any in-flight fact fetch so stale async work doesn't land after match
  if (gifFetchController) { gifFetchController.abort(); gifFetchController = null; }

  // ── Set state atomically before touching the DOM ───────────────────────
  isReconnecting       = false;  // clear any lingering reconnect state
  partnerConnected     = true;
  partnerName          = partner.name || "Anonymous";
  lastPartnerName      = "";
  canBlockDisconnected = false;

  // ── DOM updates ────────────────────────────────────────────────────────
  clearChat();
  setPartnerNameDisplay(partnerName);
  addPartnerFoundCard(partnerName);

  // Show partner's bio if they set one
  if (partner.partnerBio) {
    const bioEl       = document.createElement("div");
    bioEl.className   = "partner-bio-line";
    bioEl.textContent = `💬 ${partner.partnerBio}`;
    chat.appendChild(bioEl);
    scheduleScroll();
  }

  // ── Enable inputs — do this last so the DOM is fully ready ────────────
  setInputsEnabled(true);
  // Safety: explicitly unlock in case a prior race left these locked
  messageInput.disabled        = false;
  messageInput.readOnly        = false;
  messageInput.style.pointerEvents = "";
  messageInput.style.opacity       = "";
  updateBlockBtn();
  hideTypingIndicator();
  playNotification("partnerFound");
  incrementUnread();
  showScrollToTopBtn();
});

// Reconnect grace-period events
let partnerWasReconnecting = false;

socket.on("partnerReconnecting", (data) => {
  partnerWasReconnecting = true;
  // Silent — keep chat and inputs running
});

socket.on("partnerReconnected", (data) => {
  stopSearchRetry();
  isReconnecting         = false;
  partnerWasReconnecting = false;
  partnerName            = data.name || partnerName;
  partnerConnected       = true;
  canBlockDisconnected   = false;
  removeReconnectingMessage();
  clearPartnerAwayCountdown();
  setPartnerNameDisplay(partnerName);
  setInputsEnabled(true);
  // Explicitly unlock — race-safe double-clear
  messageInput.disabled        = false;
  messageInput.readOnly        = false;
  messageInput.style.pointerEvents = "";
  updateBlockBtn();
  hideTypingIndicator();
});

// Own socket restored to previous partner after reconnecting
socket.on("partnerRestored", (data) => {
  stopSearchRetry();
  isReconnecting       = false;   // clear reconnecting flag — we're back
  partnerName          = data.name || "Anonymous";
  partnerConnected     = true;
  lastPartnerName      = "";
  canBlockDisconnected = false;
  removeReconnectingMessage();
  setPartnerNameDisplay(partnerName);  // restore name in header (cleared on disconnect)
  setInputsEnabled(true);
  updateBlockBtn();
  hideTypingIndicator();
  showScrollToTopBtn();
  // No clearChat() — messages stay, chat resumes silently
});

socket.on("waitingForPartner", () => {
  // Guard: if partnerFound already arrived (race), do nothing at all.
  // This can happen when partnerFound and waitingForPartner are queued
  // back-to-back and arrive in the same microtask flush.
  if (partnerConnected) return;
  // Also ignore during reconnecting — server handles that path
  if (isReconnecting) return;
  partnerName = ""; setPartnerNameDisplay("");
  setInputsEnabled(false);
});

// ════════════════════════════════════════════════════════════════════════════

socket.on("partnerTyping", (typing) => {
  typing ? showTypingIndicator() : hideTypingIndicator();
});

socket.on("message", (msg) => {
  // Drop messages that arrive after partner has already disconnected/changed.
  // This handles the race where "next" was clicked but the server hadn't
  // processed it yet and forwarded one last message from the old partner.
  if (!partnerConnected) return;
  hideTypingIndicator();
  addMessage(msg.text, false, msg.messageId, msg.replyTo || null);
  playNotification("message");
  incrementUnread();
  // Only send seen receipt if the tab is actually visible
  if (msg.messageId && !document.hidden) socket.emit("seen", { messageId: msg.messageId });
});

socket.on("partnerSeen", ({ messageId }) => {
  const el = document.getElementById(`seen_${messageId}`);
  if (el) { el.textContent = "✓✓"; el.classList.add("seen"); }
});

socket.on("reacted", ({ messageId, emoji }) => {
  displayReaction(messageId, emoji, false);
});

// Tab-away events disabled — intentionally ignored
socket.on("partnerTabAway", () => {});
socket.on("partnerTabBack", () => {});

socket.on("partnerDisconnected", (data) => {
  partnerWasReconnecting = false;
  removeReconnectingMessage();
  stopSearchRetry();          // stop any running search — user must press Next manually
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = data.name || lastPartnerName || "";
  canBlockDisconnected = !!lastPartnerName;
  setInputsEnabled(false);
  updateBlockBtn();
  hideTypingIndicator();      // clear typing dots if they were showing

  // Show disconnect notice + inline block offer
  const disconnectEl = document.createElement("div");
  disconnectEl.className = "system-message-disconnect";
  disconnectEl.textContent = `❌ ${lastPartnerName || "პარტნიორი"} გათიშა.`;
  chat.appendChild(disconnectEl);

  if (lastPartnerName) {
    const offerEl = document.createElement("div");
    offerEl.className = "block-offer";
    offerEl.innerHTML =
      `<span>გსურთ დაბლოკოთ <strong>"${lastPartnerName}"</strong>? ის ვეღარ შეძლებს თქვენს შეწუხებას.</span>` +
      `<button class="block-offer-btn" id="blockOfferBtn">🚫 დაბლოკვა</button>` +
      `<div class="block-offer-report-row">` +
        `<button class="report-offer-btn" id="reportOfferBtn">🚩 რეპორტი</button>` +
      `</div>`;
    chat.appendChild(offerEl);
    scheduleScroll();

    document.getElementById("blockOfferBtn").addEventListener("click", () => {
      offerEl.remove();
      blockBtnPressCount = bumpPressCounter(blockBtnCounter, blockBtnPressCount);
      socket.emit("blockUser", { targetName: lastPartnerName });
    });

    document.getElementById("reportOfferBtn").addEventListener("click", () => {
      const btn = document.getElementById("reportOfferBtn");
      if (!btn || btn.disabled) return;
      showReportReasonModal(lastPartnerName, (reason) => {
        btn.disabled = true;
        btn.textContent = "✅ გაგზავნილია";
        socket.emit("reportUser", { reason });
        socket.emit("blockUser", { targetName: lastPartnerName });
      });
    });
  } else {
    scheduleScroll();
  }

});

socket.on("userBlocked", (data) => {
  const blockedName = data.name || lastPartnerName || "მომხმარებელი";
  stopSearchRetry();
  clearChat();
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  updateBlockBtn();
  closeGifPickerPanel();
  addSystemMessage(`🔴 „${blockedName}" -  წარმატებით იქნა დაბლოკილი 🔴`);
  setInputsEnabled(false);
  // Do NOT auto-search — user must press Next manually
});

socket.on("blockLimitReached", () => {
  addSystemMessage("🚫 ბლოკირების ლიმიტს მიაღწიეთ ამ სესიისთვის.");
});

socket.on("youWereBlocked", (data) => {
  const blockerName = data.name || "მომხმარებელი";
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  addDisconnectMessage(`${blockerName} -მა დაგბლოკათ :(`);
  // Do NOT auto-search — user must press Next manually
});

socket.on("reportConfirmed", () => {
  addSystemMessage("შეტყობინება გაგზავნილია. გმადლობთ. 🙏");
  if (reportBtn) reportBtn.disabled = true; // one report per partner
  // If reporting a disconnected partner, also clear the block state
  canBlockDisconnected = false;
  updateBlockBtn();
});

socket.on("reportBanned", () => {
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  clearChat();
  addDisconnectMessage("🚫 თქვენ დაიბლოკეთ 24 საათით — მრავალი მომხმარებლის მიერ მოხსენების გამო.");
});

socket.on("messageFlagged", () => {
  // silently drop — no notice shown to user
});

// First offence — warning, chat continues
socket.on("linkWarning", () => {
  addSystemMessage("⚠️ ლინკების გაზიარება არ შეიძლება! განმეორებით შემთხვევაში ერთი დღით დაიბლოკებით საიტიდან!");
});

// Second offence — banned
socket.on("linkBanned", () => {
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  clearChat();
  addDisconnectMessage("🚫 თქვენ დაიბლოკეთ 24 საათით ლინკების გაგზავნის გამო.");
});

// Legacy event kept for safety
socket.on("linkKicked", () => {
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  clearChat();
  addDisconnectMessage("🚫 ლინკების გაგზავნა აკრძალულია! თქვენ გაირიცხეთ საიტიდან.");
});

// Partner of the link-sender sees a notice and gets unlinked
socket.on("partnerLinkKicked", () => {
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  addDisconnectMessage("🚫 ლინკების გაგზავნა აკრძალულია! პარტნიორი გაირიცხა საიტიდან.");
});

socket.on("autoKicked", () => {
  try { sessionStorage.removeItem("gaicani_username"); } catch (_) {}
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  stopSearchRetry();
  hideTypingIndicator();
  setInputsEnabled(false);
  updateBlockBtn();
  closeGifPickerPanel();
  clearChat();
  // Show ban notice on the entry modal
  const nameModal = document.getElementById("nameModal");
  const nameError = document.getElementById("nameError");
  const saveBtn   = document.getElementById("saveNameBtn");
  if (nameModal) nameModal.style.display = "flex";
  if (nameError) {
    nameError.textContent = "🚫 თქვენ დაიბლოკეთ 24 საათით ლინკების გაგზავნის გამო. სცადეთ ხვალ.";
    nameError.style.display = "block";
  }
  if (saveBtn) saveBtn.disabled = true;
});

// awayTimeout disabled — intentionally ignored
socket.on("awayTimeout", () => {});

// ── Button handlers ───────────────────────────────────────────────────────────

// Press-counter badges: minimalist countdown of clicks remaining until the
// ad fires — shows "3" → "2" → "1", then the ad click resets it back to "3".
const PRESS_COUNTER_MAX = 4;
let nextBtnPressCount  = 0;
let blockBtnPressCount = 0;

function bumpPressCounter(counterEl, currentCount) {
  currentCount = currentCount >= PRESS_COUNTER_MAX ? 1 : currentCount + 1;
  // currentCount cycles 1,2,3,4 in lockstep with the ad-trigger counters in
  // index.html (both start at 0 and increment once per real click), so
  // currentCount === PRESS_COUNTER_MAX is exactly the click that fires the ad.
  const remaining = currentCount === PRESS_COUNTER_MAX
    ? PRESS_COUNTER_MAX - 1
    : PRESS_COUNTER_MAX - currentCount;
  counterEl.textContent = `${remaining}`;
  counterEl.style.display = "inline-block";
  return currentCount;
}

nextBtn.addEventListener("click", () => {
  nextBtnPressCount = bumpPressCounter(nextBtnCounter, nextBtnPressCount);
  nextBtn.disabled = true;
  setTimeout(() => { nextBtn.disabled = false; }, 1200);

  // Stop any stale state synchronously first
  stopSearchRetry();
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  setInputsEnabled(false);
  updateBlockBtn();
  hideTypingIndicator();
  closeGifPickerPanel();
  clearReply();
  clearChat();
  addSearchingMessage();

  // One emit — server tears down old pair AND calls tryFindPartner() itself.
  // No client-side retry needed; server queues us until a match is available.
  socket.emit("next");
});

blockBtn.addEventListener("click", () => {
  const targetName = partnerName || lastPartnerName;
  if (!targetName) return;
  const confirmed = confirm(
    `Block "${targetName}"? თქვენ ვეღარ შეხვდებით ამ იუზერს ბლოკის შემდეგ. 😡 `
  );
  if (confirmed) {
    blockBtnPressCount = bumpPressCounter(blockBtnCounter, blockBtnPressCount);
    socket.emit("blockUser", { targetName });
  }
});

reportBtn.addEventListener("click", () => {
  const targetName = partnerName || lastPartnerName;
  if (!partnerConnected && !canBlockDisconnected) return;
  if (!targetName) return;
  showReportReasonModal(targetName, (reason) => {
    socket.emit("reportUser", { reason });
    // Also block so they can't re-match
    socket.emit("blockUser", { targetName });
  });
});

sendBtn.addEventListener("click", sendMessage);

messageInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (!messageInput.disabled && !messageInput.readOnly) sendMessage();
  }
});

messageInput.addEventListener("input", () => {
  // Auto-resize textarea
  messageInput.style.height = "auto";
  messageInput.style.height = Math.min(messageInput.scrollHeight, 120) + "px";
  messageInput.style.overflowY = messageInput.scrollHeight > 120 ? "auto" : "hidden";

  // Character counter
  const len = messageInput.value.length;
  charCount.textContent = len > 0 ? `${len}/2000` : ``;
  charCount.classList.toggle("warning", len > 1800);

  // Typing indicator — only when actually connected to a partner
  if (!partnerConnected || !socket.connected) return;
  if (!isTyping) { isTyping = true; socket.emit("typing", true); }
  clearTimeout(typingTimeout);
  typingTimeout = setTimeout(() => {
    isTyping = false;
    if (partnerConnected) socket.emit("typing", false);
  }, 1500);
});

changeNameBtn.addEventListener("click", () => {
  nameInput.value         = userName;
  saveNameBtn.textContent = "Save Name";
  clearNameError();
  nameModal.style.display = "flex";
  const closeBtn = document.getElementById("nameModalClose");
  if (closeBtn) closeBtn.style.display = "block";
  setTimeout(() => nameInput.focus(), 50);
});

saveNameBtn.addEventListener("click", saveName);
nameInput.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveName(); } });

// ── Swipe-right gesture → Next (mobile) ──────────────────────────────────────
let touchStartX = 0, touchStartY = 0;

document.addEventListener("touchstart", (e) => {
  touchStartX = e.touches[0].clientX;
  touchStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener("touchend", (e) => {
  const dx = e.changedTouches[0].clientX - touchStartX;
  const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
  // Swipe right > 150 px, mostly horizontal (dy < 30% of dx),
  // AND must start from the left edge (first 30px) to avoid accidental triggers
  if (dx > 150 && dy < dx * 0.3 && touchStartX < 30 && !nextBtn.disabled) {
    nextBtn.click();
  }
}, { passive: true });

// ── Welcome page / logo home ──────────────────────────────────────────────────
// Called when user clicks the GAICANI logo to return to the welcome screen.
function goToWelcome() {
  // Registered users: logo click → go to their Dashboard page instead
  if (window.gaicaniAuthUser) {
    window.location.href = "/dashboard.html";
    return;
  }
  // Lock state FIRST so no message can slip through
  partnerConnected     = false;
  partnerName = ""; setPartnerNameDisplay("");
  lastPartnerName      = "";
  canBlockDisconnected = false;
  userName             = "";
  isFirstLogin         = true;
  isReconnecting       = false;
  setInputsEnabled(false);
  updateBlockBtn();

  // 🚫 CLEAR ALL BLOCKS — fresh session means fresh block list
  blockedUsers = new Set();
  blockedNames = [];

  socket.emit("next"); // tell server we're leaving current chat
  stopSearchRetry();
  hideTypingIndicator();
  closeGifPickerPanel();
  clearChat();
  clearReply();

  // Clear saved name so a page reload also shows welcome
  try { sessionStorage.removeItem("gaicani_username"); } catch (_) {}

  // Show the welcome/name modal fresh
  const nameModalClose = document.getElementById("nameModalClose");
  if (nameModalClose) nameModalClose.style.display = "none";
  nameInput.value         = "";
  saveNameBtn.textContent = "საუბრის დაწყება";
  clearNameError();
  nameModal.style.display = "flex";
  setTimeout(() => nameInput.focus(), 100);
}

// ── Init ──────────────────────────────────────────────────────────────────────
document.addEventListener("DOMContentLoaded", () => {
  userName       = "";
  isFirstLogin   = true;
  isReconnecting = false;
  stopSearchRetry();
  setInputsEnabled(false);
  updateBlockBtn();
  setPartnerNameDisplay("");
  saveNameBtn.textContent  = "საუბრის დაწყება";
  charCount.textContent    = "";

  // X button on name modal — only active during mid-session name change
  const nameModalClose = document.getElementById("nameModalClose");
  if (nameModalClose) {
    nameModalClose.addEventListener("click", () => {
      nameModal.style.display = "none";
      nameModalClose.style.display = "none";
      clearNameError();
    });
  }

  // Always show the welcome modal — user must press the button themselves.
  // We never auto-submit the name or auto-search on page load.
  try { sessionStorage.removeItem("gaicani_username"); } catch (_) {}

  // If a saved auth token exists, auth-client.js will hide this immediately.
  // Still show briefly for guests; auth-client suppresses for registered users.
  const _hasToken = (() => { try { return !!localStorage.getItem("gaicani_auth_token"); } catch(_){return false;} })();
  if (!_hasToken) {
    nameModal.style.display = "flex";
    setTimeout(() => nameInput.focus(), 100);
  }
});
