// Asks about a mistyped email before the sign-up form is sent. Needs email-check.js, and does nothing without it: the form still works.
// Returns true when the form should go on, false when it has put a question in `box` and is waiting for an answer.
function reviewEmail(form, input, box) {
  const email = input.value.trim();
  const check = typeof window.checkEmail === 'function' ? window.checkEmail(email) : { kind: 'ok' };
  box.textContent = '';
  if (check.kind === 'ok' || (check.kind === 'suggest' && box.dataset.kept === email)) {
    box.hidden = true;
    return true;
  }

  function answer(label, onPress) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'link';
    button.style.cssText = 'padding: 10px 14px 10px 0; font-weight: 700';
    button.textContent = label;
    button.addEventListener('click', () => {
      box.hidden = true;
      onPress();
      form.requestSubmit();
    });
    return button;
  }

  const question = document.createElement('div');
  if (check.kind === 'suggest') {
    question.textContent = 'Did you mean ' + check.suggestion + '?';
    box.append(question);
    box.append(
      answer('Yes, use it', () => {
        input.value = check.suggestion;
      }),
      answer('No, keep mine', () => {
        box.dataset.kept = email;
      }),
    );
  } else {
    const ending = email.slice(email.lastIndexOf('.') + 1);
    question.textContent =
      'Emails cannot end in ".' +
      ending +
      '", so a message to that address would not get through.' +
      (check.suggestion === undefined
        ? ' Please check it.'
        : ' Did you mean ' + check.suggestion + '?');
    box.append(question);
    if (check.suggestion !== undefined) {
      box.append(
        answer('Yes, use it', () => {
          input.value = check.suggestion;
        }),
      );
    }
  }
  box.hidden = false;
  return false;
}
