export const TOKYO_NIGHT_PRESET = `# A Pi-native Tokyo Night treatment using Nerd Font Powerline glyphs.
format = "$brand$model$thinking$directory$git_branch$git_status$activity$context$fill$time"
palette = "tokyo_night"

[palettes.tokyo_night]
base = "#1a1b26"
blue = "#7aa2f7"
cyan = "#7dcfff"
green = "#9ece6a"
orange = "#ff9e64"
purple = "#bb9af7"
red = "#f7768e"

[brand]
format = "[](blue)[ $symbol ]($style)[](blue) "
symbol = ""
style = "fg:base bg:blue bold"

[model]
format = "[](purple)[ $symbol $model ]($style)[](purple) "
symbol = "󰚩"
style = "fg:base bg:purple bold"

[thinking]
format = "[](cyan)[ $symbol $level ]($style)[](cyan) "
symbol = "󰔟"
style = "fg:base bg:cyan bold"

[directory]
format = "[](blue)[ $symbol $path ]($style)[](blue) "
symbol = "󰉋"
style = "fg:base bg:blue bold"

[git_branch]
format = "[](orange)[ $symbol $branch ]($style)"
symbol = ""
style = "fg:base bg:orange bold"

[git_status]
format = "[$all_status( $ahead_behind) ]($style)[](orange) "
style = "fg:base bg:orange bold"

[activity]
format = "[](green)[ $text ]($style)[](green) "
symbol = "󰑮"
style = "fg:base bg:green bold"

[context]
format = "[]($style)[ $symbol $percentage ](fg:base bg:green bold)[](green) "
symbol = "󰍛"

[[context.display]]
threshold = 0
style = "green"
hidden = false

[fill]
symbol = " "
style = "none"

[time]
format = "[](blue)[ $symbol $time ]($style)[](blue)"
symbol = ""
style = "fg:base bg:blue bold"
`;
