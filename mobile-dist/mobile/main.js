import { createMobilePairing, parsePairingUrl } from '../src/crypto/protocol.js';
import { decodeTransportFrame, encodeTransportFrame } from '../src/transport/wire.js';
const statusElement = required('status');
const inbox = required('inbox');
const empty = required('empty');
const template = required('approval-template');
const cards = new Map();
let channel;
let socket;
let receiveTail = Promise.resolve();
function required(id) {
    const element = document.getElementById(id);
    if (element === null)
        throw new Error(`missing ${id}`);
    return element;
}
function setStatus(label, tone = 'working') {
    statusElement.textContent = label;
    statusElement.dataset['tone'] = tone;
}
function relayUrl(value, roomId) {
    const url = new URL(value);
    url.searchParams.set('roomId', roomId);
    url.searchParams.set('role', 'mobile');
    return url.href;
}
function renderRequested(event) {
    const existing = cards.get(event.approvalId);
    if (existing !== undefined)
        existing.remove();
    const fragment = template.content.cloneNode(true);
    const card = fragment.querySelector('.approval-card');
    if (card === null)
        throw new Error('invalid card template');
    const tool = card.querySelector('[data-field="tool"]');
    const reason = card.querySelector('[data-field="reason"]');
    const allow = card.querySelector('[data-action="allow"]');
    const reject = card.querySelector('[data-action="reject"]');
    if (tool === null || reason === null || allow === null || reject === null)
        throw new Error('invalid card');
    tool.textContent = event.toolName;
    reason.textContent = event.reason?.trim() || 'The agent needs your decision before this action can continue.';
    bindHoldToAllow(allow, () => { void decide(event.approvalId, 'allowed-once', card); });
    reject.addEventListener('click', () => { void decide(event.approvalId, 'rejected', card); });
    cards.set(event.approvalId, card);
    inbox.prepend(card);
    empty.hidden = true;
}
function bindHoldToAllow(button, activate) {
    let timer;
    let completed = false;
    const cancel = () => {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = undefined;
        button.dataset['holding'] = 'false';
    };
    button.addEventListener('pointerdown', (event) => {
        if (event.button !== 0 || button.disabled)
            return;
        completed = false;
        button.setPointerCapture(event.pointerId);
        button.dataset['holding'] = 'true';
        timer = setTimeout(() => {
            completed = true;
            cancel();
            activate();
        }, 700);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
        button.addEventListener(type, cancel);
    }
    button.addEventListener('click', (event) => {
        // Keyboard activation remains accessible; pointer clicks require the hold.
        if (event.detail === 0 && !completed)
            activate();
    });
    button.addEventListener('contextmenu', event => { event.preventDefault(); });
}
function renderResolved(event) {
    const card = cards.get(event.approvalId);
    if (card === undefined)
        return;
    card.dataset['resolved'] = 'true';
    const actions = card.querySelector('.actions');
    const result = card.querySelector('[data-field="result"]');
    if (actions !== null)
        actions.hidden = true;
    if (result !== null) {
        result.hidden = false;
        result.textContent = event.outcome === 'allowed-once' ? 'Allowed once' : event.outcome === 'rejected' ? 'Rejected' : 'Closed on desktop';
    }
}
async function decide(approvalId, outcome, card) {
    if (channel === undefined || socket?.readyState !== WebSocket.OPEN)
        return;
    for (const button of card.querySelectorAll('button'))
        button.disabled = true;
    const result = card.querySelector('[data-field="result"]');
    if (result !== null) {
        result.hidden = false;
        result.textContent = 'Sending encrypted decision…';
    }
    try {
        const envelope = await channel.seal({
            version: 1,
            type: 'approval-decision',
            decision: { approvalId, outcome },
        });
        socket.send(encodeTransportFrame(envelope));
        if (result !== null)
            result.textContent = 'Decision sent. Waiting for Host confirmation…';
    }
    catch {
        if (result !== null)
            result.textContent = 'Could not send. Use the desktop approval.';
    }
}
async function receive(data) {
    const wire = decodeTransportFrame(new Uint8Array(data));
    if (channel === undefined)
        throw new Error('pairing not initialized');
    const payload = await channel.open(wire);
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload))
        throw new Error('invalid payload');
    const record = payload;
    const event = record['event'];
    if (record['version'] !== 1 || record['type'] !== 'approval-event'
        || typeof event !== 'object' || event === null || Array.isArray(event))
        throw new Error('invalid payload');
    const approval = event;
    if (approval['type'] === 'approval/requested'
        && typeof approval['approvalId'] === 'string'
        && typeof approval['toolName'] === 'string') {
        renderRequested({
            type: 'approval/requested',
            approvalId: approval['approvalId'],
            toolName: approval['toolName'],
            ...(typeof approval['reason'] === 'string' ? { reason: approval['reason'] } : {}),
        });
    }
    else if (approval['type'] === 'approval/resolved'
        && typeof approval['approvalId'] === 'string'
        && typeof approval['outcome'] === 'string') {
        renderResolved({
            type: 'approval/resolved',
            approvalId: approval['approvalId'],
            outcome: approval['outcome'],
        });
    }
    else {
        throw new Error('invalid approval event');
    }
}
async function start() {
    const pairingUrl = location.href;
    history.replaceState(null, '', `${location.pathname}${location.search}`);
    const invitation = parsePairingUrl(pairingUrl);
    setStatus('Creating encrypted session…');
    const pairing = await createMobilePairing(invitation);
    socket = new WebSocket(relayUrl(invitation.relayUrl, invitation.roomId));
    socket.binaryType = 'arraybuffer';
    socket.addEventListener('open', () => {
        setStatus('Authenticating Host…');
        socket?.send(encodeTransportFrame(pairing.hello));
    });
    let completed = false;
    socket.addEventListener('message', (message) => {
        if (!(message.data instanceof ArrayBuffer)) {
            socket?.close(1003, 'binary frames required');
            return;
        }
        receiveTail = receiveTail.then(async () => {
            if (!completed) {
                const wire = decodeTransportFrame(new Uint8Array(message.data));
                const result = await pairing.complete(wire);
                channel = result.channel;
                completed = true;
                setStatus('End-to-end encrypted', 'safe');
                return;
            }
            await receive(message.data);
        }).catch(() => {
            setStatus('Secure session failed. Use desktop approval.', 'error');
            socket?.close(1008, 'secure session failed');
        });
    });
    socket.addEventListener('close', () => {
        if (statusElement.dataset['tone'] !== 'error')
            setStatus('Disconnected. Desktop remains available.', 'error');
        for (const button of document.querySelectorAll('button'))
            button.disabled = true;
    });
    socket.addEventListener('error', () => {
        setStatus('Relay unavailable. Use desktop approval.', 'error');
    });
}
if ('serviceWorker' in navigator && window.isSecureContext) {
    void navigator.serviceWorker.register('/sw.js');
}
void start().catch(() => {
    setStatus('Invalid or expired QR code', 'error');
});
