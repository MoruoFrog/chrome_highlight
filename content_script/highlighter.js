(function() {
    const highLighter = (function () {
        const storage  = chrome.storage.local
        const singleton = {}
        const events = []

        // 插入的dom
        const highLightTagHead = '<span\
            style="background: rgb(255, 198, 0);\
                border-radius: 3px;\
                box-shadow: rgba(0, 0, 0, 0.3) 1px 1px 3px;\
                display:inline;\
                color: black;\
                padding: 0 2px; "\
            data-highlighted="1">'
        const highLightTagTail = '</span>'

        let keywords = [],
            reg,
            _switch,
            highlightedElements = [],
            mutationByCancel = false // 取消高亮操作导致的Mutation
        
        singleton.init = () => {
            // 1. 从storage获取配置
            storage.get({
                highlight__mor__keywords: '',
                highlight__mor__switch: 'on',
            }, items => {
                let keywordStr = items.highlight__mor__keywords
        
                keywords = keywordStr || []
                _switch = items.highlight__mor__switch
                reg = new RegExp(keywords.join('|'), 'g')
                singleton.highLight() // 因为chrome storage读取是异步的
            })

            // 2. 与pop建立通信
            chrome.runtime.onMessage.addListener(function(message, sender, sendResponse){
                events.forEach(event => {
                    if (event.cmd === message.cmd) event.cb && event.cb({ message, sender, sendResponse })
                })
            })

            // 3. 监听变动
            const mo = new MutationObserver(singleton.highLight)
            const options = {
                'childList': true,
                'characterData': true,
                'subtree': true,
            }
            mo.observe(document.body, options)
        }

        singleton.highLight = () => {
            if (mutationByCancel) {
                mutationByCancel = false
                return // 取消高亮操作导致的Mutation，直接返回
            }
            if (_switch === 'off') return
            if (keywords.length === 0) return
    
            const all = document.all
            const len = all.length
    
            const excludeTagName = ['STYLE', 'LINK', 'SCRIPT', 'META', 'TITLE']
            for (let i = 0; i < len; i++) {
                const element = all[i]
    
                ;[...element.childNodes]
                    .filter(node => node.nodeType === 3 
                                && !node.parentNode.dataset.highlighted // 被高亮之后需要标记，否则会无限循环
                                && !excludeTagName.includes(node.tagName)
                                && document.body.contains(node))
                    .forEach(textNode => {
                        const text = textNode.data
                        if (text.search(reg) === -1) return
    
                        const newElement = document.createElement('morun')
                        newElement.innerHTML = text.replace(reg, match => `${highLightTagHead}${match}${highLightTagTail}`)
                        textNode.replaceWith(newElement)
                        highlightedElements.push(newElement)
                    })
            }
        }

        singleton.cancelHight = () => {
            if (highlightedElements.length === 0) return
            highlightedElements.forEach(element => {
                try {
                    element.outerHTML = element.innerText
                } catch (e) {
                    console.log(e, element)
                }
            })
            highlightedElements = []
            mutationByCancel = true
        }

        singleton.on = (event, cb) => {
            events.push({
                cmd: `highlight__mor__${event}`,
                cb,
            })
        }

        singleton.switchOn = () => {
            _switch = 'on'
            storage.set({
                highlight__mor__switch: 'on',
            })
            singleton.highLight()
        }

        singleton.switchOff = () => {
            singleton.cancelHight()
            _switch = 'off'

            storage.set({
                highlight__mor__switch: 'off',
            })
        }

        Object.defineProperty(singleton, 'keywords', {
            get() {
                return keywords
            },
            set(v) {
                keywords = v

                chrome.storage.local.set({
                    highlight__mor__keywords: keywords,
                })

                singleton.cancelHight()

                if (keywords.length > 0) {
                    const regStr = keywords.join('|')
                    reg = new RegExp(regStr, 'g')
                    singleton.highLight()
                }
            }
        })

        Object.defineProperty(singleton, 'switch', {
            get() {
                return _switch
            },
            set() {
                return new Error('switch is readonly')
            }
        })

        return singleton
    })()

    highLighter.init()
    
    highLighter.on('updatekeyword', ({ message }) => {
        highLighter.keywords = message.keywordList
    })
    highLighter.on('getsetting', ({ sendResponse }) => {
        sendResponse({
            cmd: 'highlight__mor__getsetting',
            keywords: highLighter.keywords,
            _switch: highLighter.switch,
        })
    })
    highLighter.on('off', highLighter.switchOff)
    highLighter.on('on', highLighter.switchOn)
    highLighter.on('clearkeyword', () => highLighter.keywords = [])

})()