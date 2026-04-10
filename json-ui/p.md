A index.html with tailwind and alpine.js cdn , which works as a json to 'ui' , meaning, user can select any property from json, and it generates UI on the right side. add/remove nodes etc. origianl json as is, only view changes. user can change 'wrapping' element of json property they want to display, div, p, h1 ...h6, b, i, anything. a box for writing css for those elements too.everything happens real time
kinda like how 'markdown' editor and viewer are mapped side by side. remember, original json can be a textarea or a file upload, or an api url that returns json, and user isn't given any choice to edit original json. just the ui to show its properties.
we'd also need some 'for loop' logic for the 'arrays' in json, so it'l generate same 'wrapping element' for all the props if it's for the prop inside array. we'll name it api-ui or json-ui. by shakeeb ahmad (https://shakeeb.in)

---

yes do it all. and also - i needed this to be 'textarea' as well, you created ui to add individual nodes... how will i arrange thise nodes if i need to? how will i create ui styles, e.g., i need to target all things and change direction, then target some specific element (this means we also need to be able to include class/id etc., is there a simpler way to writie html like h1.post-heading.bold will be actually <h1 class="post heading bold">) to do that i can write its class and add styles . so only one textarea for all markup - there i'll add whatever elements i need, and only one textare for all styles.

and basic idea you misunderstood, i created this so that i won't have to figure out a way to look closely into json data, the data should be readable to me like a tree or something, collapsable etc., and wherever my 'cursor' is inside our (html) editor textarea, i should be able to add any elemtn with one click. e.g. i write in editor.

div.a
Post link: {{posts[3].url}}

## here, posts[3].url isn't typed manually (well it can be, but) it should've been 'added at caret' using a single click at 'url' element. if i change it to posts[].url, it'll generate multiple of these div.a elements array's length number of times.

I see this in the preview.
My Posts
href="#1 #2"

the rendered html for your reference:

<div class="bg-white p-3 border min-h-full" x-html="render()"><div class=" wrapper"></div><h1 class=" title"> My Posts</h1><div class=" post"></div><a class=" link"> href="#1 #2"</a></div>

i think we should use proper libraries for these things, 1. json tree isn't collapsible etc., so use some good cdn supporting lib for this, add click to add at caret on top of that. 2. html structure generator, i think we have some librarries for this... it'd be standard. since i see clearly it's not working as intended.
div.wrapper
h1.title My Posts
div.post{{posts.0}}{{posts.0}}
a.link href="{{posts[].url}}"
{{posts[].title}}

## as i understand shoul've made div.wrapper a wrapper for all the below items since they're indented that way. let's make this work - professional.
