#include <Windows.h>
#include <WebView2.h>
#include <string>

struct AppContext {
    HWND hwnd;
    ICoreWebView2Controller* controller;
    ICoreWebView2* webview;
};

class EnvironmentCompletedHandler : public ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler {
public:
    EnvironmentCompletedHandler(AppContext* context) : m_context(context), m_ref(1) {}

    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Environment* env) override {
        if (FAILED(result)) {
            DestroyWindow(m_context->hwnd);
            return result;
        }
        auto* handler = new ControllerCompletedHandler(m_context);
        env->CreateCoreWebView2Controller(m_context->hwnd, handler);
        handler->Release();
        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler || riid == IID_IUnknown) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2EnvironmentCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_ref); }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG ref = InterlockedDecrement(&m_ref);
        if (ref == 0) delete this;
        return ref;
    }

private:
    AppContext* m_context;
    ULONG m_ref;
};

class ControllerCompletedHandler : public ICoreWebView2CreateCoreWebView2ControllerCompletedHandler {
public:
    ControllerCompletedHandler(AppContext* context) : m_context(context), m_ref(1) {}

    HRESULT STDMETHODCALLTYPE Invoke(HRESULT result, ICoreWebView2Controller* controller) override {
        if (FAILED(result)) {
            DestroyWindow(m_context->hwnd);
            return result;
        }
        m_context->controller = controller;
        m_context->controller->get_CoreWebView2(&m_context->webview);

        ICoreWebView2Settings* settings = nullptr;
        if (SUCCEEDED(m_context->webview->get_Settings(&settings))) {
            settings->put_AreDevToolsEnabled(FALSE);
            settings->put_AreDefaultContextMenusEnabled(FALSE);
            settings->Release();
        }

        m_context->webview->Navigate(L"https://dude00614-hub.github.io/infinite-code-/");

        RECT bounds;
        GetClientRect(m_context->hwnd, &bounds);
        m_context->controller->put_Bounds(bounds);

        return S_OK;
    }

    HRESULT STDMETHODCALLTYPE QueryInterface(REFIID riid, void** ppv) override {
        if (riid == IID_ICoreWebView2CreateCoreWebView2ControllerCompletedHandler || riid == IID_IUnknown) {
            *ppv = static_cast<ICoreWebView2CreateCoreWebView2ControllerCompletedHandler*>(this);
            AddRef();
            return S_OK;
        }
        *ppv = nullptr;
        return E_NOINTERFACE;
    }
    ULONG STDMETHODCALLTYPE AddRef() override { return InterlockedIncrement(&m_ref); }
    ULONG STDMETHODCALLTYPE Release() override {
        ULONG ref = InterlockedDecrement(&m_ref);
        if (ref == 0) delete this;
        return ref;
    }

private:
    AppContext* m_context;
    ULONG m_ref;
};

LRESULT CALLBACK WndProc(HWND hwnd, UINT msg, WPARAM wParam, LPARAM lParam) {
    AppContext* ctx = (AppContext*)GetWindowLongPtr(hwnd, GWLP_USERDATA);

    switch (msg) {
    case WM_CREATE: {
        auto* ctx = new AppContext{ hwnd, nullptr, nullptr };
        SetWindowLongPtr(hwnd, GWLP_USERDATA, (LONG_PTR)ctx);

        auto* handler = new EnvironmentCompletedHandler(ctx);
        HRESULT hr = CreateCoreWebView2EnvironmentWithOptions(
            nullptr,
            L"./data",
            nullptr,
            handler
        );
        handler->Release();
        if (FAILED(hr)) {
            delete ctx;
            SetWindowLongPtr(hwnd, GWLP_USERDATA, 0);
            return -1;
        }
        return 0;
    }
    case WM_SIZE: {
        if (ctx && ctx->controller) {
            RECT bounds;
            GetClientRect(hwnd, &bounds);
            ctx->controller->put_Bounds(bounds);
        }
        return 0;
    }
    case WM_DESTROY: {
        if (ctx) {
            if (ctx->webview) ctx->webview->Release();
            if (ctx->controller) ctx->controller->Release();
            delete ctx;
            SetWindowLongPtr(hwnd, GWLP_USERDATA, 0);
        }
        PostQuitMessage(0);
        return 0;
    }
    }
    return DefWindowProc(hwnd, msg, wParam, lParam);
}

int WINAPI WinMain(HINSTANCE hInstance, HINSTANCE, LPSTR, int nCmdShow) {
    HRESULT hr = CoInitializeEx(nullptr, COINIT_APARTMENTTHREADED);
    if (FAILED(hr)) return 1;

    WNDCLASSEX wc = {};
    wc.cbSize = sizeof(wc);
    wc.lpfnWndProc = WndProc;
    wc.hInstance = hInstance;
    wc.hCursor = LoadCursor(nullptr, IDC_ARROW);
    wc.hbrBackground = (HBRUSH)(COLOR_WINDOW + 1);
    wc.lpszClassName = L"InfiniteCodeWClass";

    if (!RegisterClassEx(&wc)) {
        CoUninitialize();
        return 1;
    }

    int width = 1200;
    int height = 800;
    int screenWidth = GetSystemMetrics(SM_CXSCREEN);
    int screenHeight = GetSystemMetrics(SM_CYSCREEN);
    int x = (screenWidth - width) / 2;
    int y = (screenHeight - height) / 2;

    HWND hwnd = CreateWindowEx(
        0, L"InfiniteCodeWClass", L"Infinite Code",
        WS_OVERLAPPEDWINDOW, x, y, width, height,
        nullptr, nullptr, hInstance, nullptr
    );
    if (!hwnd) {
        CoUninitialize();
        return 1;
    }

    ShowWindow(hwnd, nCmdShow);
    UpdateWindow(hwnd);

    MSG msg;
    while (GetMessage(&msg, nullptr, 0, 0)) {
        TranslateMessage(&msg);
        DispatchMessage(&msg);
    }

    CoUninitialize();
    return 0;
}
