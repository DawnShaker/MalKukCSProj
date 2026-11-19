using System.Security.Claims;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Mvc;
using RealEstateAgency.BusinessLogicLayer;
using RealEstateAgency.DTOs;
using RealEstateAgency.IntegrationLayer;

namespace RealEstateAgency.ViewLayer.Controllers;

[ApiController]
[Route("api/auth")]
public class AccountController : ControllerBase
{
    private readonly AccountService accounts;
    private readonly SecurityClient security;
    private readonly IAntiforgery antiforgery;

    public AccountController(AccountService accounts, SecurityClient security, IAntiforgery antiforgery)
    {
        this.accounts = accounts;
        this.security = security;
        this.antiforgery = antiforgery;
    }

    [HttpGet("session")]
    public IActionResult Session() => Ok(new
    {
        user = accounts.FindCurrent(User), csrfToken = antiforgery.GetAndStoreTokens(HttpContext).RequestToken,
        auth = new { identifier = "username", signup = false, recovery = false, refresh = false }, needsRefresh = false
    });

    [HttpGet("ready")]
    public async Task<IActionResult> Ready(CancellationToken cancellationToken)
    {
        var ready = await security.IsReady(cancellationToken);
        return Ok(new { ready });
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginDto dto)
    {
        var identity = await security.Login(dto.Username, dto.Password);
        var profile = accounts.SignIn(identity);
        var principal = new ClaimsPrincipal(new ClaimsIdentity(
            [new Claim(ClaimTypes.NameIdentifier, profile.Id.ToString())], CookieAuthenticationDefaults.AuthenticationScheme));
        var expires = identity.ExpiresAt < DateTime.UtcNow.AddHours(1) ? identity.ExpiresAt : DateTime.UtcNow.AddHours(1);
        await HttpContext.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, principal,
            new AuthenticationProperties { ExpiresUtc = expires, IsPersistent = false, AllowRefresh = false });
        HttpContext.User = principal;
        return Ok(new { user = profile, csrfToken = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout()
    {
        await HttpContext.SignOutAsync(CookieAuthenticationDefaults.AuthenticationScheme);
        HttpContext.User = new ClaimsPrincipal(new ClaimsIdentity());
        return Ok(new { csrfToken = antiforgery.GetAndStoreTokens(HttpContext).RequestToken });
    }

    [HttpPost("signup")]
    [HttpPost("recover")]
    [HttpPost("reset")]
    [HttpPost("refresh")]
    public IActionResult Unsupported() => StatusCode(405, new { error = "Обліковими записами керує адміністратор Security. Для входу використовуйте видані логін і пароль." });
}
