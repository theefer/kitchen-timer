command        = startCommand / stopCommand / createCommand / helpCommand
startCommand   = "start" (__ name:timerName)? { return {type: 'start', name: name || ''}; }
stopCommand    = stopWords (__ name:timerName)? { return {type: 'stop', name: name}; }
createCommand  = createWords duration:timerDef (__ "timer")? __ name:description { return {type: 'create', duration: duration, name: name}; }
               / createWords duration:timerDef (__ "timer")? { return {type: 'create', duration: duration, name: ''}; }
helpCommand    = helpWords anything { return {type: 'help'}; }
timerDef       = minutes:minutesDef __ (and __)? seconds:secondsDef { return minutes * 60 + seconds; }
               / minutes:minutesDef { return minutes * 60; }
               / seconds:secondsDef { return seconds; }
minutesDef     = number:number __ andHalf __ "minute" "s"? { return number + 0.5; }
               / number:number __ "minute" "s"? __ andHalf { return number + 0.5; }
               / number:number __ "minute" "s"?            { return number; }
secondsDef     = number:number __ andHalf __ "second" "s"? { return number + 0.5; }
               / number:number __ "second" "s"? __ andHalf { return number + 0.5; }
               / number:number __ "second" "s"?            { return number; }
description    = ("for" (__ "the")? __)? timerName:timerName { return timerName; }
timerName      = a:[a-z0-9] bs:[a-z0-9 ]* { return a + bs.join(''); }
// map either '1' or 'one'
number         = digits / digitWord
digits         = a:[1-9] b:[0-9]? { return parseInt(a + b); }
digitWord      = "one"   { return 1; }
               / "two"   { return 2; }
               / "three" { return 3; }
               / "four"  { return 4; }
               / "five"  { return 5; }
               / "six"   { return 6; }
               / "seven" { return 7; }
               / "eight" { return 8; }
               / "nine"  { return 9; }
and            = "and"
andHalf        = "and a half"
createWords    = (("add" / "create") __)? ("new" __)?
stopWords      = "stop" / "pause"
helpWords      = "help" / "how do i" / "how can i"
__             = " "+
anything       = .*
