class CartRemoveButton extends HTMLElement {
  constructor() {
    super();

    this.addEventListener('click', (event) => {
      event.preventDefault();

      const cartItems = this.closest('cart-items') || this.closest('cart-drawer-items');
      if (cartItems) {
        cartItems.updateQuantity(this.dataset.index, 0);
      } else {
        console.warn('No cart items container found for CartRemoveButton.');
      }
    });
  }
}

customElements.define('cart-remove-button', CartRemoveButton);

class CartItems extends HTMLElement {
  constructor() {
    super();

    // Find line item status element
    this.lineItemStatusElement =
      document.getElementById('shopping-cart-line-item-status') ||
      document.getElementById('CartDrawer-LineItemStatus');

    // Attach debounced onChange handler
    const debouncedOnChange = debounce((event) => this.onChange(event), ON_CHANGE_DEBOUNCE_TIMER);
    this.addEventListener('change', debouncedOnChange.bind(this));
  }

  cartUpdateUnsubscriber = undefined;

  connectedCallback() {
    this.cartUpdateUnsubscriber = subscribe(PUB_SUB_EVENTS.cartUpdate, (event) => {
      if (event.source !== 'cart-items') {
        this.onCartUpdate();
      }
    });
  }

  disconnectedCallback() {
    if (this.cartUpdateUnsubscriber) {
      this.cartUpdateUnsubscriber();
    }
  }

  resetQuantityInput(id) {
    const input = this.querySelector(`#Quantity-${id}`);
    if (input) {
      input.value = input.getAttribute('value');
    }
    this.isEnterPressed = false;
  }

  setValidity(event, index, message) {
    const target = event.target;
    target.setCustomValidity(message);
    target.reportValidity();
    this.resetQuantityInput(index);
    target.select();
  }

  validateQuantity(event) {
    const input = event.target;
    const inputValue = parseInt(input.value, 10);
    const index = input.dataset.index;
    let message = '';

    if (inputValue < input.dataset.min) {
      message = window.quickOrderListStrings.min_error.replace('[min]', input.dataset.min);
    } else if (inputValue > parseInt(input.max, 10)) {
      message = window.quickOrderListStrings.max_error.replace('[max]', input.max);
    } else if (inputValue % parseInt(input.step, 10) !== 0) {
      message = window.quickOrderListStrings.step_error.replace('[step]', input.step);
    }

    if (message) {
      this.setValidity(event, index, message);
    } else {
      input.setCustomValidity('');
      input.reportValidity();
      this.updateQuantity(
        index,
        inputValue,
        document.activeElement.getAttribute('name'),
        input.dataset.quantityVariantId
      );
    }
  }

  onChange(event) {
    this.validateQuantity(event);
  }

  onCartUpdate() {
    const isDrawer = this.tagName === 'CART-DRAWER-ITEMS';
    const url = isDrawer ? `${routes.cart_url}?section_id=cart-drawer` : `${routes.cart_url}?section_id=main-cart-items`;

    fetch(url)
      .then((response) => response.text())
      .then((responseText) => {
        const html = new DOMParser().parseFromString(responseText, 'text/html');
        if (isDrawer) {
          this.updateDrawer(html);
        } else {
          const sourceQty = html.querySelector('cart-items');
          if (sourceQty) this.innerHTML = sourceQty.innerHTML;
        }
      })
      .catch((e) => console.error(e));
  }

  updateDrawer(html) {
    const selectors = ['cart-drawer-items', '.cart-drawer__footer'];
    selectors.forEach((selector) => {
      const targetElement = document.querySelector(selector);
      const sourceElement = html.querySelector(selector);
      if (targetElement && sourceElement) {
        targetElement.replaceWith(sourceElement);
      }
    });
  }

  getSectionsToRender() {
    return [
      {
        id: 'main-cart-items',
        section: document.getElementById('main-cart-items')?.dataset.id,
        selector: '.js-contents',
      },
      {
        id: 'cart-icon-bubble',
        section: 'cart-icon-bubble',
        selector: '.shopify-section',
      },
      {
        id: 'cart-live-region-text',
        section: 'cart-live-region-text',
        selector: '.shopify-section',
      },
      {
        id: 'main-cart-footer',
        section: document.getElementById('main-cart-footer')?.dataset.id,
        selector: '.js-contents',
      },
    ];
  }

  updateQuantity(line, quantity, name, variantId) {
    this.enableLoading(line);

    const body = JSON.stringify({
      line,
      quantity,
      sections: this.getSectionsToRender().map((section) => section.section),
      sections_url: window.location.pathname,
    });

    fetch(`${routes.cart_change_url}`, { ...fetchConfig(), body })
      .then((response) => response.text())
      .then((state) => {
        const parsedState = JSON.parse(state);
        if (parsedState.errors) {
          this.handleUpdateError(line, parsedState.errors);
          return;
        }

        this.renderUpdatedCart(parsedState, line, quantity, name, variantId);
      })
      .catch(() => this.handleUpdateError(line, window.cartStrings.error))
      .finally(() => this.disableLoading(line));
  }

  enableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems?.classList.add('cart__items--disabled');

    const overlays = [
      ...document.querySelectorAll(`#CartItem-${line} .loading__spinner`),
      ...document.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`),
    ];
    overlays.forEach((overlay) => overlay.classList.remove('hidden'));

    this.lineItemStatusElement?.setAttribute('aria-hidden', 'false');
  }

  disableLoading(line) {
    const mainCartItems = document.getElementById('main-cart-items') || document.getElementById('CartDrawer-CartItems');
    mainCartItems?.classList.remove('cart__items--disabled');

    const overlays = [
      ...document.querySelectorAll(`#CartItem-${line} .loading__spinner`),
      ...document.querySelectorAll(`#CartDrawer-Item-${line} .loading__spinner`),
    ];
    overlays.forEach((overlay) => overlay.classList.add('hidden'));
  }

  handleUpdateError(line, errorMessage) {
    const errors = document.getElementById('cart-errors') || document.getElementById('CartDrawer-CartErrors');
    if (errors) errors.textContent = errorMessage;
    this.resetQuantityInput(line);
  }

  renderUpdatedCart(parsedState, line, quantity, name, variantId) {
    // Handle cart update rendering here...
  }
}

customElements.define('cart-items', CartItems);

// Define CartNote if not already defined
if (!customElements.get('cart-note')) {
  customElements.define(
    'cart-note',
    class CartNote extends HTMLElement {
      constructor() {
        super();

        this.addEventListener(
          'input',
          debounce((event) => {
            const body = JSON.stringify({ note: event.target.value });
            fetch(`${routes.cart_update_url}`, { ...fetchConfig(), body });
          }, ON_CHANGE_DEBOUNCE_TIMER)
        );
      }
    }
  );
}
