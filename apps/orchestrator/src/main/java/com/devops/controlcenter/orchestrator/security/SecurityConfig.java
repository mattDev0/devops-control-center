package com.devops.controlcenter.orchestrator.security;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter;
import org.springframework.web.cors.CorsConfiguration;
import org.springframework.web.cors.CorsConfigurationSource;
import org.springframework.web.cors.UrlBasedCorsConfigurationSource;

import java.util.List;

@Configuration
@EnableWebSecurity
public class SecurityConfig {

    private final JwtAuthenticationFilter jwtAuthenticationFilter;
    private final RateLimitFilter rateLimitFilter;

    public SecurityConfig(JwtAuthenticationFilter jwtAuthenticationFilter, RateLimitFilter rateLimitFilter) {
        this.jwtAuthenticationFilter = jwtAuthenticationFilter;
        this.rateLimitFilter = rateLimitFilter;
    }

    @Bean
    public SecurityFilterChain filterChain(HttpSecurity http) throws Exception {
        http
            .cors(cors -> cors.configurationSource(corsConfigurationSource()))
            .csrf(csrf -> csrf.disable())
            .sessionManagement(session -> session.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
            .exceptionHandling(eh -> eh.authenticationEntryPoint(
                new org.springframework.security.web.authentication.HttpStatusEntryPoint(org.springframework.http.HttpStatus.UNAUTHORIZED)
            ))
            .authorizeHttpRequests(auth -> auth
                .dispatcherTypeMatchers(jakarta.servlet.DispatcherType.ASYNC).permitAll()
                .requestMatchers(
                    org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher("/api/auth/login"),
                    org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher("/api/auth/guest"),
                    org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher("/health"),
                    org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher("/actuator/**")
                ).permitAll()
                .requestMatchers(org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher(org.springframework.http.HttpMethod.POST, "/api/servers/deployments/**")).hasAuthority("ROLE_ADMIN")
                .requestMatchers(org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher(org.springframework.http.HttpMethod.POST, "/api/ci/workflows/**")).hasAuthority("ROLE_ADMIN")
                .requestMatchers(org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher(org.springframework.http.HttpMethod.POST, "/api/servers/docker/**")).hasAuthority("ROLE_ADMIN")
                .requestMatchers(org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher("/api/servers/logs")).hasAuthority("ROLE_ADMIN")
                .requestMatchers(org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher("/api/servers/docker/containers/*/logs")).hasAuthority("ROLE_ADMIN")
                .requestMatchers(org.springframework.security.web.util.matcher.AntPathRequestMatcher.antMatcher("/api/**")).hasAnyAuthority("ROLE_GUEST", "ROLE_ADMIN")
                .anyRequest().denyAll()
            )
            .addFilterBefore(rateLimitFilter, UsernamePasswordAuthenticationFilter.class)
            .addFilterBefore(jwtAuthenticationFilter, UsernamePasswordAuthenticationFilter.class);

        return http.build();
    }

    @Bean
    public CorsConfigurationSource corsConfigurationSource() {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOrigins(List.of("https://devops.mattdev0.tech", "http://localhost:8085"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"));
        config.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-Agent-Key"));
        config.setAllowCredentials(true);

        UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
        source.registerCorsConfiguration("/**", config);
        return source;
    }
}
